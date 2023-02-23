import * as fsPath from 'node:path'

import createError from 'http-errors'

import {
  compareLocalAndRemoteBranch,
  determineOriginAndMain,
  hasBranch,
  workBranchName
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
  description : `Checks the status of a unit of work branches, issues, and pull requests.

See also 'work detail' for basic static information.`
}

const method = 'get'
const path = ['work', ':workKey', 'status']
const parameters = [
  {
    name : 'allPulls',
    isBoolean : true,
    description: 'Will include all related pull requests in the report, rather than just merged or open PRs.'
  },
  {
    name        : 'noFetch',
    isBoolean   : true,
    description : 'Supresses default behavior of fetching remote changes before comparing local and remote branches.'
  }
]
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { allPulls = false, noFetch = false, workKey } = req.vars

  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)

  const octocache = new Octocache({ authToken })

  const workDB = new WorkDB({ app, authToken, reporter })

  const report = {
    issues: {},
    projects: {}
  }

  const workUnit = workDB.getData(workKey)
  if (workUnit === undefined) {
    throw createError.NotFound(`No such unit of work '${workKey}' found in Work DB.`)
  }

  const workBranch = workBranchName({ primaryIssueID : workUnit.issues[0].id })

  for (const { name: projectFQN, private: isPrivate } of workUnit.projects) {
    reporter.push(`Checking status of <em>${projectFQN}<rst>...`)

    const projectStatus = {}
    report.projects[projectFQN] = projectStatus
    const [org, project] = projectFQN.split('/')
    const projectPath = fsPath.join(app.liq.playground(), org, project)

    const [origin, main] = determineOriginAndMain({ noFetch, projectPath, reporter })
    let remote
    if (isPrivate !== true) { // i.e., public
      remote = WORKSPACE
    }
    else {
      remote = origin
    }

    // let's make sure we have all the latest info
    if (noFetch !== true) {
      reporter.push(`Fetching from remote ${remote}...`)
      tryExec(`cd '${projectPath}' && git fetch -a ${remote}`)
      if (remote !== origin) {
        tryExec(`cd '${projectPath}' && git fetch -a ${origin}`)
      }
    }

    // we will need this; they are exposed later so that the object has the key ordering we want
    const hasLocalBranch = hasBranch({ branch : workBranch, projectPath, reporter })
    const remoteBranch = `${remote}/${workBranch}`
    const hasRemoteBranch = hasBranch({ branch : remoteBranch, projectPath, reporter })

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
    let reportPRs = await octocache.paginate(`GET /repos/${projectFQN}/pulls`, { head : workBranch, state : 'all' })
    const prCount = reportPRs.length
    projectStatus.totalPRs = prCount
    if (allPulls !== true) {
      reportPRs = reportPRs.filter((pr) => pr.merged_at || pr.state === 'open')
    }
    for (const { number, merged_at: mergedAt, state, url } of reportPRs) {
      projectStatus.pullRequests.push({ number, state, merged : !!mergedAt, url })
    }

    // analyze branch status
    const workBranchReport = {}
    projectStatus.workBranch = workBranchReport

    workBranchReport.localBranchFound = hasLocalBranch
    workBranchReport.remoteBranchFound = hasRemoteBranch
    if (hasLocalBranch === true && hasRemoteBranch === true) {
      const syncStatus = compareLocalAndRemoteBranch({ branch : workBranch, remote, projectPath })
      workBranchReport.syncStatus = syncStatus
    }
  }

  httpSmartResponse({ data : report, msg : reporter.taskReport.join('\n'), req, res })
}

export { func, help, parameters, path, method }
