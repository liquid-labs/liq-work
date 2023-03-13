import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'
import { Octocache } from '@liquid-labs/octocache'

import { determineWorkStatus } from './determine-work-status'
import { WorkDB } from './work-db'

const doStatus = async({ app, cache, reporter, req, res, workKey }) => {
  const { allPulls, noFetch, updateLocal } = req.vars

  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)

  const octocache = new Octocache({ authToken })

  const workDB = new WorkDB({ app, authToken, reporter })

  const workUnit = workDB.requireData(workKey)

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

  const msg = `Report for work unit <code>${workKey}<rst>:`

  httpSmartResponse({ data : statusReport, msg, req, res })
}

const getStatusEndpointParameters = ({ workDesc }) => {
  const help = {
    name        : 'Work status',
    summary     : 'Reports on the status of a unit of work.',
    description : `Checks the status of a unit of work branches, issues, and pull requests. By default, the local copy of remote main branches will be updated in order to provide up-to-date information on the status. This can be supressed with the \`noFetch\` option.

  The resulting report contains two main sections, 'issues' and 'projects'. The issues section indicates the number, state (open or closed), and URL for each issue.

  The projects section breaks down pull requests, branch status, and merge status for each project. By default, only open or merged pull requests are included, although a count of all related PRs is included as well. To get details for all pull requests, use the \`allPulls\` option.

  See also 'work detail' for basic static information.`
  }

  const method = 'put'

  const parameters = [
    {
      name        : 'allPulls',
      isBoolean   : true,
      description : 'Will include all related pull requests in the report, rather than just merged or open PRs.'
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

  return { help, method, parameters }
}

export { doStatus, getStatusEndpointParameters }
