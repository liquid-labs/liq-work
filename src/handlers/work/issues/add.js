import { claimIssues, verifyIssuesAvailable } from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'
import { Octocache } from '@liquid-labs/octocache'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { commonAssignParameters } from '../_lib/common-assign-parameters'
import { WorkDB } from '../_lib/work-db'

const help = {
  name        : 'Work issues add',
  summary     : 'Add an issue to a unit of work.',
  description : 'Adds an issue to a unit of work.'
}

const method = 'put'
const path = ['work', ':workKey', 'issues', 'add']

const parameters = [
  ...commonAssignParameters()
]
const issueOptionsFunc = async ({ app, cache, workKey }) => {
  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)
  const octocache = new Octocache({ authToken })

  const workDB = new WorkDB({ app })

  const projects = workDB.getData(workKey).projects?.map((p) => p.name)
  if (projects === undefined) return []

  const options = []
  for (const project of projects) {
    const issues = await octocache.paginate(`GET /repos/${project}/issues`, { state: 'open' })
    // TODO: use constant for 'assigned'
    options.push(...issues
      .filter((i) => !i.labels.some((l) => l.name === 'assigned'))
      .map((i) => i.url.replace(new RegExp('.+/repos/([^/]+)/([^/]+)/issues/(\\d+).*'), '$1/$2/$3'))
    )
  }

  return options
}
parameters.find((p) => p.name === 'issues').optionsFunc = issueOptionsFunc
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  let { assignee, comment, issues, noAutoAssign, workKey } = req.vars

  const workDB = new WorkDB({ app, reporter })

  // normalize the issue spec; add default project to issues
  const workData = workDB.getData(workKey)
  if (workData === undefined) {
    throw createError.NotFound(`No such active unit of work '${workKey}'.`)
  }
  const primaryProject = workData.projects[0].name
  issues = issues.map((i) => i.match(/^\d+$/) ? primaryProject + '/' + i : i)

  const credDB = new CredentialsDB({ app, cache, reporter })
  const authToken = credDB.getToken(purposes.GITHUB_API)

  await verifyIssuesAvailable({ authToken, issues, noAutoAssign, notClosed : true, reporter })
  await claimIssues({ assignee, authToken, comment, issues, reporter })

  const updatedWorkData = await workDB.addIssues({ authToken, issues, workKey })

  httpSmartResponse({
    data: updatedWorkData,
    msg: `Added '<em>${issues.join("<rst>', '<em>")}<rst>' to unit of work '<em>${workKey}<rst>'.`,
    req,
    res
  })
}

export { func, help, parameters, path, method }
