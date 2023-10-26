import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { Octocache } from '@liquid-labs/octocache'

import { commonCleanParameters } from './common-clean-parameters'
import { deleteWorkBranches } from './delete-work-branches'
import { determineWorkStatus } from './determine-work-status'
import { WorkDB } from './work-db'

const doClean = async({ app, cache, reporter, req, res, workKey }) => {
  reporter = reporter.isolate()

  const {
    all = false,
    noCloseWork = false,
    noDeleteBranches = false,
    noFetch = false,
    noUpdateLocal = false
  } = req.vars

  const closeWork = !noCloseWork
  const deleteBranches = !noDeleteBranches
  const updateLocal = !noUpdateLocal

  const credDB = app.ext.credentialsDB
  const authToken = await credDB.getToken('GITHUB_API')

  const octocache = new Octocache({ authToken })

  const workDB = new WorkDB({ app, authToken, reporter })

  if (all === true) {
    const msgs = []
    for (const workKey of workDB.getWorkKeys()) {
      const statusReport = await doCleanWorkUnit({
        app,
        closeWork,
        deleteBranches,
        noFetch,
        octocache,
        reporter,
        updateLocal,
        workDB,
        workKey
      })

      const msg = statusReport.isClosed === true
        ? `<bold>Closed<rst> <em>${workKey}<rst>.`
        : `<bold>Unable<rst> to close <em>${workKey}<rst>`

      msgs.push(msg)
    }

    const msg = reporter.taskReport.join('\n') + '\n\n' + msgs.join('\n')

    httpSmartResponse({ msg, req, res })
  }
  else {
    const statusReport = await doCleanWorkUnit({
      app,
      closeWork,
      deleteBranches,
      noFetch,
      octocache,
      reporter,
      updateLocal,
      workDB,
      workKey
    })

    const msg = reporter.taskReport.join('\n') + '\n\n'
      + (statusReport.isClosed === true
        ? `<bold>Closed<rst> <em>${workKey}<rst>.`
        : `<bold>Unable<rst> to close <em>${workKey}<rst>`)

    httpSmartResponse({ msg, req, res })
  }
}

const doCleanWorkUnit = async({
  app,
  closeWork,
  deleteBranches,
  noFetch,
  octocache,
  reporter,
  updateLocal,
  workDB,
  workKey
}) => {
  const workUnit = workDB.requireData(workKey)

  const statusReport = await determineWorkStatus({
    allPulls : false,
    app,
    octocache,
    noFetch,
    reporter,
    updateLocal,
    workKey,
    workUnit
  })

  if (deleteBranches === true && !Object.values(statusReport.issues).some((i) => i.state !== 'closed')) {
    deleteWorkBranches({ app, noFetch, statusReport, workKey, reporter })
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

  return statusReport
}

const getCleanEndpointParameters = ({ workDesc, includeAll = false }) => {
  const help = {
    name        : `Work clean (${workDesc})`,
    summary     : 'Cleans work branches and records.',
    description : `Cleans up the work branches and records associated the ${workDesc} unit of work. By default, the local copy of remote main branches will be updated in order to provide up-to-date information on the status in order to determine whether the work artifacts can be cleaned (removed). This can be supressed with the \`noFetch\` option.`
  }

  const parameters = includeAll === true
    ? [
      {
        name        : 'all',
        isBoolean   : true,
        description : 'Attempt to clean all open work rather than the current work unit.'
      },
      ...commonCleanParameters
    ]
    : [...commonCleanParameters]
  Object.freeze(parameters)

  return {
    help,
    method : 'put',
    parameters
  }
}

export {
  doClean,
  getCleanEndpointParameters
}
