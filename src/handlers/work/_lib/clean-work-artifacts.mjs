import createError from 'http-errors'

import { determineCurrentBranch, determineOriginAndMain } from '@liquid-labs/git-toolkit'
import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'
import { Octocache } from '@liquid-labs/octocache'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { determinePathHelper } from './determine-path-helper'
import { determineWorkStatus } from './determine-work-status'
import { WorkDB } from './work-db'

const cleanWorkArtifacts = async({
  allPulls,
  app,
  cache,
  closeWork,
  deleteBranches,
  noFetch,
  reporter,
  updateLocal,
  workKey
}) => {
  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)

  const octocache = new Octocache({ authToken })

  const workDB = new WorkDB({ app, authToken, reporter })

  const workUnit = workDB.getData(workKey)
  if (workUnit === undefined) {
    throw createError.NotFound(`No such unit of work '${workKey}' found in Work DB.`)
  }

  const statusReport = await determineWorkStatus({
    allPulls,
    app,
    octocache,
    noFetch,
    reporter,
    updateLocal,
    workKey,
    workUnit
  })

  doClean({ app, deleteBranches, closeWork, noFetch, reporter, statusReport, workKey, workDB })

  return statusReport
}

const doClean = ({ app, closeWork, deleteBranches, noFetch, reporter, statusReport, workKey, workDB }) => {
  const workUnit = workDB.getData(workKey)
  if (deleteBranches === true && !Object.values(statusReport.issues).some((i) => i.state !== 'closed')) {
    for (const [projectFQN, projectStatus] of Object.entries(statusReport.projects)) {
      reporter.push(`Considering deleting work branch in project ${projectFQN}...`)
      if (projectStatus.workBranch?.localBranchFound === true
          && projectStatus.localChanges?.mergedToRemoteMain === true) {
        const { projectPath } = determinePathHelper({ app, projectFQN })
        const currBranch = determineCurrentBranch({ projectPath })
        if (currBranch === workKey) {
          const [, main] = determineOriginAndMain({ noFetch, projectPath, reporter })
          reporter.push(`Switching current branch from '${workKey}' to '${main}' before deleting '${workKey}'...`)
          tryExec(`cd '${projectPath}' && git checkout ${main}`,
            { msg : `Cannot switch from branch '${workKey}' to '${main}' in order to delete branch '${workKey}'. You may need to 'commit' or 'stash' your work.` })
        }
        tryExec(`cd '${projectPath}' && git branch -d ${workKey}`)
        projectStatus.workBranch.localBranchRemoved = true
      }
      else {
        reporter.push(`  skipping; local work branch ${projectStatus.workBranch?.localBranchFound !== true ? 'not found' : 'not merged'}.`)
      }
    }
  }
  else if (deleteBranches === true) {
    reporter.push('Skipping consideration of branch deletions due to open issues.')
  }

  if (closeWork === true && !Object.values(statusReport.issues).some((i) => i.state !== 'closed')) {
    reporter.push('Considering closing work...')
    let closableCount = 0
    for (const [projectFQN, projectStatus] of Object.entries(statusReport.projects)) {
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
      statusReport.isClosed = true
    }
  }
  else if (closeWork === true) {
    reporter.push('<warn>Cannot close<rst> work because not all issues are closed.')
  }
}

export { cleanWorkArtifacts }
