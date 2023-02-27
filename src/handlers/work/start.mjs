import createError from 'http-errors'

import { claimIssues, verifyIssuesAvailable } from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'
import { determineImpliedProject } from '@liquid-labs/liq-projects-lib'

import { commonAssignParameters } from './_lib/common-assign-parameters'
import { commonAddProjectParameters } from './_lib/common-add-project-parameters'
import { WorkDB } from './_lib/work-db'

const help = {
  name        : 'Work start',
  summary     : 'Creates a new unit of work.',
  description : 'Creates a new unit of work involving the designated projects. By default, the local development copy of any project which is a dependency of another is linked the dependent project unless `noLink` is specified.'
}

const method = 'post'
const path = ['work', 'start']
const parameters = [
  /* TODO
  {
    name : 'allowUncomitted',
    isBoolean: true,
    description: "By default, the 'start work' process will fail if any of the target repos are unclean. Setting `allowUncomitted` will proceed if there are uncommitted files and the repos are otherwise clean."
  }, */
  {
    name         : 'projects',
    isMultivalue : true,
    description  : 'The project(s) to include in the new unit of work. If none are specified, then will guess the current implied project based on the client working directory.',
    optionsFunc  : ({ model }) => Object.keys(model.playground.projects)
  },
  ...commonAddProjectParameters(),
  ...commonAssignParameters()
]
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  let { assignee, comment, issues, noAutoAssign = false, projects } = req.vars
  // First, let's process projects. If nothing specified, assume the current, implied project.
  if (projects === undefined) {
    const currDir = req.get('X-CWD')
    projects = [determineImpliedProject({ currDir })]
  }
  // Now, make sure all project specs are valid.
  for (const project of projects) {
    if (!(project in model.playground.projects)) { throw createError.BadRequest(`No such local project '${project}'. Do you need to import it?`) }
  }

  // Normalize issues as '<org>/<project>/<issue number>'
  issues = issues.map((i) => i.match(/^\d+$/) ? projects[0] + '/' + i : i)

  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)

  await verifyIssuesAvailable({ authToken, issues, noAutoAssign, notClosed : true })
  await claimIssues({ assignee, authToken, comment, issues, reporter })

  const workDB = new WorkDB({ app, authToken, reporter })
  const workData = await workDB.startWork({ app, issues, projects, reporter })

  reporter.push(`Started work '<em>${workData.description}<rst>'.`)

  httpSmartResponse({ data : workData, msg : reporter.taskReport.join('\n'), req, res })
}

export { func, help, parameters, path, method }
