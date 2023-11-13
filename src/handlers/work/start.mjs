import createError from 'http-errors'

import {
  claimIssues,
  determineGitHubLogin,
  getGitHubOrgAndProjectBasename,
  verifyIssuesAvailable
} from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { getPackageJSON } from '@liquid-labs/npm-toolkit'

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
  {
    name         : 'projects',
    isMultivalue : true,
    description  : 'The project(s) to include in the new unit of work. If none are specified, then will guess the current implied project based on the client working directory.',
    optionsFunc  : ({ app }) => app.ext._liqProjects.playgroundMonitor.listProjects()
  },
  ...commonAddProjectParameters(),
  ...commonAssignParameters()
]
Object.freeze(parameters)

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  let { assignee, comment, issues, noAutoAssign = false, projects } = req.vars
  // First, let's process projects. If nothing specified, assume the current, implied project.
  if (projects === undefined) {
    const currPkgJSON = await getPackageJSON({ pkgDir: req.get('X-CWD') })
    const currProject = currPkgJSON.name
    projects = [currProject]
  }
  // Now, make sure all project specs are valid.
  for (const project of projects) {
    if (app.ext._liqProjects.playgroundMonitor.getProjectData(project) === undefined) {
      throw createError.BadRequest(`No such local project '${project}'. Do you need to import it?`)
    }
  }

  // Normalize issues as '<org>/<project>/<issue number>'
  issues = issues.map((i) => {
    if (i.match(/^\d+$/)) {
      const { pkgJSON } = app.ext._liqProjects.playgroundMonitor.getProjectData(projects[0])
      const { org: ghOrg, projectBasename } = getGitHubOrgAndProjectBasename({ packageJSON : pkgJSON })
      return ghOrg + '/' + projectBasename + '/' + i
    }
    return i
  })

  const credDB = app.ext.credentialsDB
  const authToken = await credDB.getToken('GITHUB_API')

  const githubLogin = (await determineGitHubLogin({ authToken })).login
  // TODO: this should be an integration hook point
  await verifyIssuesAvailable({ authToken, availableFor : githubLogin, issues, noAutoAssign, reporter })
  // TODO: this should be an integration hook point
  await claimIssues({ assignee, authToken, comment, issues, reporter })

  const workDB = new WorkDB({ app, authToken, reporter })
  const workData = await workDB.startWork({ app, issues, projects, reporter })

  reporter.push(`Started work '<em>${workData.description}<rst>'.`)

  httpSmartResponse({ data : workData, msg : reporter.taskReport.join('\n'), req, res })
}

export { func, help, parameters, path, method }
