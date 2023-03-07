import { httpSmartResponse } from '@liquid-labs/http-smart-response'

import { cleanWorkArtifacts } from './_lib/clean-work-artifacts'

const help = {
  name        : 'Work status',
  summary     : 'Reports on the status of a unit of work.',
  description : `Checks the status of a unit of work branches, issues, and pull requests. By default, the local copy of remote main branches will be updated in order to provide up-to-date information on the status. This can be supressed with the \`noFetch\` option.

The resulting report contains two main sections, 'issues' and 'projects'. The issues section indicates the number, state (open or closed), and URL for each issue.

The projects section breaks down pull requests, branch status, and merge status for each project. By default, only open or merged pull requests are included, although a count of all related PRs is included as well. To get details for all pull requests, use the \`allPulls\` option.

See also 'work detail' for basic static information.`
}

const method = 'put'
const path = ['work', ':workKey', 'status']
const parameters = [
  {
    name        : 'allPulls',
    isBoolean   : true,
    description : 'Will include all related pull requests in the report, rather than just merged or open PRs.'
  },
  {
    name        : 'clean',
    isBoolean   : true,
    description : 'Remove branches and records associated with a complete unit of work. This is equivalent to calling with `updateLocal`, `deleteBranches`, and `closeWork` true (and `clean` will override any explicit value). Also, refer to the work update endpoint.' // TODO: how to link??
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
  reporter = reporter.isolate()

  const {
    allPulls = false,
    clean = false,
    noFetch = false,
    workKey
  } = req.vars

  let {
    closeWork = false,
    deleteBranches = false,
    updateLocal = false
  } = req.vars

  if (clean === true) {
    closeWork = true
    deleteBranches = true
    updateLocal = true
  }

  const statusReport = await cleanWorkArtifacts({
    allPulls,
    app,
    cache,
    closeWork,
    deleteBranches,
    noFetch,
    reporter,
    updateLocal,
    workKey
  })

  httpSmartResponse({ data : statusReport, msg : reporter.taskReport.join('\n'), req, res })
}

export { func, help, parameters, path, method }
