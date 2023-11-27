import {
  compareLocalAndRemoteBranch,
  determineCurrentBranch,
  determineOriginAndMain,
  hasBranch
} from '@liquid-labs/git-toolkit'
import { getGitHubOrgBasenameAndVersion } from '@liquid-labs/github-toolkit'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { WORKSPACE } from './constants'

const determineWorkStatus = async({
  allPulls,
  app,
  octocache,
  noFetch,
  reporter,
  updateLocal,
  workKey,
  workUnit
}) => {
  const report = {
    issues   : {},
    projects : {}
  }

  await Promise.all([
    generateIssuesReport({ octocache, report, reporter, workKey, workUnit }),
    generateProjectsReport({ allPulls, app, octocache, noFetch, report, reporter, updateLocal, workKey, workUnit })
  ])

  return report
}

const generateIssuesReport = async({ octocache, report, reporter, workKey, workUnit }) => {
  const asyncData = []
  for (const { id: issueRef } of workUnit.issues) {
    const [owner, repo, number] = issueRef.split('/')
    asyncData.push(octocache.request(`GET /repos/${owner}/${repo}/issues/${number}`, { noCache : true }))
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
    const { projectPath } = await app.ext._liqProjects.playgroundMonitor.getProjectData(projectFQN)

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
        tryExec(`cd '${projectPath}' && git branch -a --contains ${workKey} ${origin}/${main}`).stdout.length > 0
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
        tryExec(`cd '${projectPath}' && git branch -a --contains ${remote}/${workKey} ${origin}/${main}`)
          .stdout.length > 0
      projectStatus.remoteChanges = {
        mergedToLocalMain  : localMainContainsRemoteChanges,
        mergedToRemoteMain : remoteMainContainsRemoteChanges
      }
    }

    // analyze PRs
    projectStatus.pullRequests = []
    reporter.push(`Retrieving pull requests associated with head '${workKey}'...`)
    const { packageJSON } = await app.ext._liqProjects.playgroundMonitor.getProjectData(projectFQN)
    const { org: ghOrg, projectBasename } = getGitHubOrgBasenameAndVersion({ packageJSON })
    let reportPRs =
      await octocache.paginate(`GET /repos/${ghOrg}/${projectBasename}/pulls`, { head : workKey, state : 'all' })
    // As of 2023-03-08, the 'head' argument requires (for cross-repo merges) the name of the individual that
    // requested the pull, which is unknowable. Also (weirdly), if there is no match on the head, it returns
    // everything (?!), so we implement post-processing here
    reportPRs = reportPRs.filter((pr) => pr.head.ref === workKey)
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

export { determineWorkStatus }
