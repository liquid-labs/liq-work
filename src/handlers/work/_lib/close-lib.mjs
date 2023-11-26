import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { releaseIssues } from '@liquid-labs/github-toolkit'
import { Octocache } from '@liquid-labs/octocache'

import { deleteWorkBranches } from './delete-work-branches'
import { determineWorkStatus } from './determine-work-status'
import { WorkDB } from './work-db'

const doClose = async({ app, cache, reporter, req, res, workKey }) => {
  reporter = reporter.isolate()

  const {
    noUnassign = false
  } = req.vars

  const credDB = app.ext.credentialsDB
  const authToken = await credDB.getToken('GITHUB_API')

  const octocache = new Octocache({ authToken })

  const workDB = new WorkDB({ app, authToken, reporter })

  const statusReport = await doCloseWorkUnit({
    app,
    authToken,
    noUnassign,
    octocache,
    reporter,
    workDB,
    workKey
  })

  const msg = reporter.taskReport.join('\n') + '\n\n'
    + (statusReport.isClosed === true
      ? `<bold>Closed<rst> <em>${workKey}<rst>.`
      : `<bold>Unable<rst> to close <em>${workKey}<rst>`)

  httpSmartResponse({ msg, req, res })
}

const doCloseWorkUnit = async({
  app,
  authToken,
  noUnassign,
  octocache,
  reporter,
  workDB,
  workKey
}) => {
  const workUnit = workDB.requireData(workKey)

  const statusReport = await determineWorkStatus({
    allPulls    : false,
    app,
    octocache,
    noFetch     : true,
    reporter,
    updateLocal : false,
    workKey,
    workUnit
  })

  await deleteWorkBranches({ app, noFetch : true, statusReport, workKey, reporter })

  if (noUnassign !== true) {
    const issues = workDB.getIssueKeys(workKey)
    await releaseIssues({ authToken, issues, noUnassign, noUnlabel : false, reporter })
  }

  workDB.closeWork(workKey)
  statusReport.isClosed = true

  return statusReport
}

const getCloseEndpointParameters = ({ alternateTo, workDesc, includeAll = false }) => {
  const help = {
    alternateTo,
    name        : `Work close (${workDesc})`,
    summary     : 'Closes work branches and records.',
    description : `Closes an open unit of work, removing the branches and the local work records associated with the ${workDesc} unit of work and, by default, unassigns the current user from the associated issues. The 'noUnassign' parameter can be set 'true' to keep the assignment.`
  }

  const parameters = [
    {
      name        : 'noUnassign',
      isBoolean   : true,
      description : 'Supresses the default behavior of unassigning the current user from any open issues associated with the unit of work.'
    }
  ]
  Object.freeze(parameters)

  return {
    help,
    method : 'put',
    parameters
  }
}

export {
  doClose,
  getCloseEndpointParameters
}
