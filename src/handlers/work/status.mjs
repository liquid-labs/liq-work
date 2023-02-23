import * as fsPath from 'node:path'

import createError from 'http-errors'

import {
  compareLocalAndRemoteBranch,
  determineCurrentBranch,
  determineOriginAndMain,
  hasBranch
} from '@liquid-labs/git-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'
import { Octocache } from '@liquid-labs/octocache'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { WORKSPACE } from './_lib/constants'
import { WorkDB } from './_lib/work-db'

const help = {
  name        : 'Work status',
  summary     : 'Reports on the status of a unit of work.',
  description : `Checks the status of a unit of work branches, issues, and pull requests. By default, the local copy of remote main branches will be updated in order to provide up-to-date information on the status. This can be supressed with the \`noFetch\` option.

The resulting report contains two main sections, 'issues' and 'projects'. The issues section indicates the number, state (open or closed), and URL for each issue.

The projects section breaks down pull requests, branch status, and merge status for each project. By default, only open or merged pull requests are included, although a count of all related PRs is included as well. To get details for all pull requests, use the \`allPulls\` option.

See also 'work detail' for basic static information.`
}

const method = 'get'
const path = ['work', ':workKey', 'status']
const parameters = [
  {
    name        : 'allPulls',
    isBoolean   : true,
    description : 'Will include all related pull requests in the report, rather than just merged or open PRs.'
  },
  {
    name        : 'closeWork',
    isBoolean   : true,
    description : 'Will close the unit of work if 1) all issues are closed, 2) there is at least one merged PR, and 3) there are not any un-merged local work branch changes. The final criteria is only relevant if there is a local work branch present.'
  },
  {
    name        : 'deleteBranches',
    isBoolean   : true,
    description : 'Will delete local work branches and, if on local work branch, switch the current branch to the main branch if 1) all issues are closed and 2) all local work branch changes are reflected in the remote main branch.'
  },
  {
    name        : 'noFetch',
    isBoolean   : true,
    description : 'Supresses default behavior of fetching remote changes before comparing local and remote branches.'
  },
  {
    name        : 'updateLocal',
    isBoolean   : true,
    description : 'Will update local main and working branches with changes from the respective remote branch counterparts prior to analysis.'
  }
]
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const {
    allPulls = false,
    closeWork = false,
    deleteBranches = false,
    noFetch = false,
    updateLocal = false,
    workKey
  } = req.vars

  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)

  const octocache = new Octocache({ authToken })

  const workDB = new WorkDB({ app, authToken, reporter })

  const report = {
    issues   : {},
    projects : {}
  }

  const workUnit = workDB.getData(workKey)
  if (workUnit === undefined) {
    throw createError.NotFound(`No such unit of work '${workKey}' found in Work DB.`)
  }

  await Promise.all([
    generateIssuesReport({ octocache, report, reporter, workKey, workUnit }),
    generateProjectsReport({ allPulls, app, octocache, noFetch, report, reporter, updateLocal, workKey, workUnit })
  ])

  if (deleteBranches === true && !Object.values(report.issues).some((i) => i.state !== 'closed')) {
    for (const [projectFQN, statusReport] of Object.entries(report.projects)) {
      reporter.push(`Considering deleting work branch in project ${projectFQN}...`)
      if (statusReport.workBranch?.localBranchFound === true
          && statusReport.localChanges?.mergedToRemoteMain === true) {
        const { projectPath } = determinePathHelper({ app, projectFQN })
        const currBranch = determineCurrentBranch({ projectPath })
        if (currBranch === workKey) {
          const [, main] = determineOriginAndMain({ noFetch, projectPath, reporter })
          reporter.push(`Switching current branch from '${workKey}' to '${main}' before deleting '${workKey}'...`)
          tryExec(`cd '${projectPath}' && git checkout ${main}`,
            { msg : `Cannot switch from branch '${workKey}' to '${main}' in order to delete branch '${workKey}'. You may need to 'commit' or 'stash' your work.` })
        }
        tryExec(`cd '${projectPath}' && git branch -d ${workKey}`)
        statusReport.workBranch.localBranchRemoved = true
      }
      else {
        reporter.push(`  skipping; local work branch ${statusReport.workBranch?.localBranchFound !== true ? 'not found' : 'not merged'}.`)
      }
    }
  }
  else if (deleteBranches === true) {
    reporter.push('Skipping consideration of branch deletions due to open issues.')
  }

  if (closeWork === true && !Object.values(report.issues).some((i) => i.state !== 'closed')) {
    reporter.push('Considering closing work...')
    let closableCount = 0
    for (const [projectFQN, projectStatus] of Object.entries(report.projects)) {
      const hasMergedPR = projectStatus.pullRequests.some((pr) => pr.merged === true)
      if (hasMergedPR && projectStatus.workBranch.syncStatus !== 'local ahead') { // TODO: 'local ahead' really needs to be a constant
        closableCount += 1
      }
      else {
        reporter.push(`  <warn>Cannot close work<rst> due to ${!hasMergedPR ? 'no evidence of a merged PR' : 'un-merged local work branch changes'} in project <em>${projectFQN}<rst>.`)
        break // no need for further analysis
      }
    }
    if (closableCount === workUnit.projects.length) {
      // then all issues are closed and all changes appear merged
      workDB.closeWork(workKey)
      report.isClosed = true
    }
  }

  httpSmartResponse({ data : report, msg : reporter.taskReport.join('\n'), req, res })
}

const determinePathHelper = ({ app, projectFQN }) => {
  const [org, project] = projectFQN.split('/')
  const projectPath = fsPath.join(app.liq.playground(), org, project)

  return { org, project, projectPath }
}

const generateIssuesReport = async({ octocache, report, reporter, workKey, workUnit }) => {
  const asyncData = []
  for (const { id: issueRef } of workUnit.issues) {
    const [owner, repo, number] = issueRef.split('/')
    asyncData.push(octocache.request(`GET /repos/${owner}/${repo}/issues/${number}`))
  }
  const issueData = await Promise.all(asyncData)

  for (const { number, state, html_url: url } of issueData) {
    // eslint-disable-next-line prefer-regex-literals
    const issueRef = url.replace(new RegExp('.+/([^/]+/[^/]+/)issues/(\\d+)'), '$1$2')
    report.issues[issueRef] = { number, state, url }
  }
}

const generateProjectsReport = async({
  allPulls,
  app,
  octocache,
  noFetch,
  report,
  reporter,
  updateLocal,
  workKey,
  workUnit
}) => {
  for (const { name: projectFQN, private: isPrivate } of workUnit.projects) {
    reporter.push(`Checking status of <em>${projectFQN}<rst>...`)

    const projectStatus = {}
    report.projects[projectFQN] = projectStatus
    const { projectPath } = determinePathHelper({ app, projectFQN })

    const [origin, main] = determineOriginAndMain({ noFetch, projectPath, reporter })
    let remote
    if (isPrivate !== true) { // i.e., public
      remote = WORKSPACE
    }
    else {
      remote = origin
    }

    // let's make sure we have all the latest info about the remote branches
    if (noFetch !== true) {
      reporter.push(`Fetching from remote ${remote}...`)
      tryExec(`cd '${projectPath}' && git fetch -a ${remote}`)
      if (remote !== origin) {
        tryExec(`cd '${projectPath}' && git fetch -a ${origin}`)
      }
    }

    // we will need this; they are exposed later so that the object has the key ordering we want
    const hasLocalBranch = hasBranch({ branch : workKey, projectPath, reporter })
    const remoteBranch = `${remote}/${workKey}`
    const hasRemoteBranch = hasBranch({ branch : remoteBranch, projectPath, reporter })

    if (updateLocal === true) {
      // TODO: provide a 'workTree' option which would allow us to keep the main work tree (current branch) in place; would want to make that smart and use the main branch where we can
      const currBranch = determineCurrentBranch({ projectPath })
      reporter.push(`Updating local <em>${main}<rst> branch from <em>${origin}/${main}<rst>...`)
      try {
        tryExec(`cd '${projectPath}' && git checkout ${main} && git merge ${origin}/${main}`,
          // 'branch' is after the branch name here because it reads a little better for the 'special' default branch,
          // I think.
          { msg : `Failed attempt to switch ${projectFQN} to ${main} branch and merge ${origin}/${main}. You may need to 'commit' or 'stash' your work.` })
        if (hasLocalBranch && hasRemoteBranch) {
          reporter.push(`Updating local <em>${workKey}<rst> branch from <em>${remote}/${main}<rst>...`)
          tryExec(`cd '${projectPath}' && git checkout ${workKey} && git merge ${remote}/${workKey}`,
            { msg : `Failed attempt to switch ${projectFQN} to branch ${workKey} and merge ${remote}/${workKey}. You may need to 'commit' or 'stash' your work.` })
        }
      }
      finally {
        tryExec(`cd '${projectPath}' && git checkout ${currBranch}`,
          { msg : `Very unexpectedly failed to restore ${projectFQN} to branch ${currBranch}.` })
      }
    }

    // local changes reflected in remote master master?
    if (hasLocalBranch === true) {
      reporter.push(`Analyzing merge state of local work branch ${workKey}...`)
      const localMainContainsLocalChanges =
        tryExec(`cd '${projectPath}' && git branch -a --contains ${workKey} ${main}`).stdout.length > 0
      const remoteMainContainsLocalChanges =
        tryExec(`cd '${projectPath}' && git branch -a --contains ${workKey} ${remote}/${main}`).stdout.length > 0
      projectStatus.localChanges = {
        mergedToLocalMain  : localMainContainsLocalChanges,
        mergedToRemoteMain : remoteMainContainsLocalChanges
      }
    }
    if (hasRemoteBranch) {
      reporter.push(`Analyzing merge state of remote work branch ${workKey}...`)
      const localMainContainsRemoteChanges =
        tryExec(`cd '${projectPath}' && git branch -a --contains ${remote}/${workKey} ${main}`).stdout.length > 0
      const remoteMainContainsRemoteChanges =
        tryExec(`cd '${projectPath}' && git branch -a --contains ${remote}/${workKey} ${remote}/${main}`)
          .stdout.length > 0
      projectStatus.remoteChanges = {
        mergedToLocalMain  : localMainContainsRemoteChanges,
        mergedToRemoteMain : remoteMainContainsRemoteChanges
      }
    }

    // analyze PRs
    projectStatus.pullRequests = []
    let reportPRs = await octocache.paginate(`GET /repos/${projectFQN}/pulls`, { head : workKey, state : 'all' })
    const prCount = reportPRs.length
    projectStatus.totalPRs = prCount
    if (allPulls !== true) {
      reportPRs = reportPRs.filter((pr) => pr.merged_at || pr.state === 'open')
    }
    for (const { number, merged_at: mergedAt, state, html_url: url } of reportPRs) {
      projectStatus.pullRequests.push({ number, state, merged : !!mergedAt, url })
    }

    // analyze branch status
    const workBranchReport = {}
    projectStatus.workBranch = workBranchReport

    workBranchReport.localBranchFound = hasLocalBranch
    workBranchReport.remoteBranchFound = hasRemoteBranch
    if (hasLocalBranch === true && hasRemoteBranch === true) {
      const syncStatus = compareLocalAndRemoteBranch({ branch : workKey, remote, projectPath })
      workBranchReport.syncStatus = syncStatus
    }
  }
}

export { func, help, parameters, path, method }
