import { httpSmartResponse } from '@liquid-labs/http-smart-response'

import { commonAddProjectParameters } from '../../_lib/common-add-project-parameters'
import { requireImpliedBranch } from '../../_lib/require-implied-work'
import { WorkDB } from '../../_lib/work-db'

const doAddProjects = async({ app, cache, reporter, req, res, workKey }) => {
  reporter = reporter.isolate()

  const { projects } = req.vars

  const credDB = app.ext.credentialsDB
  const authToken = await credDB.getToken('GITHUB_API')
  const workDB = new WorkDB({ app, authToken, reporter })

  const updatedWorkData = await workDB.addProjects({ app, projects, reporter, workKey })

  httpSmartResponse({
    data : updatedWorkData,
    msg  : `${reporter.taskReport.join('\n')}

Added projects '<em>${projects.join("<rst>', '<em>")}<rst>' to unit of work '<em>${workKey}<rst>'.`,
    req,
    res
  })
}

const getAddProjectsEndpointParameters = ({ workDesc }) => {
  const parameters = [
    {
      name         : 'projects',
      isMultivalue : true,
      description  : 'The project to add to the unit of work. May be specify multiple projects.',
      optionsFunc  : async({ app, cache, req, workKey }) => {
        workKey = workKey || await requireImpliedBranch({ req })

        const credDB = app.ext.credentialsDB
        const authToken = await credDB.getToken('GITHUB_API')
        const workDB = new WorkDB({ app, authToken })
        const currProjects = workDB.getData(workKey).projects?.map((p) => p.name)

        return app.ext._liqProjects.playgroundMonitor.listProjects().filter((p) => !currProjects.includes(p))
      }
    },
    ...commonAddProjectParameters()
  ]
  Object.freeze(parameters)

  return {
    help : {
      name        : 'Work projects add',
      summary     : `Add projects to the ${workDesc} unit of work.`,
      description : `Adds one or more projects to the ${workDesc} of work. By default, the local development copy of any project which is a dependency of another is linked the dependent project unless \`noLink\` is specified.`
    },
    method : 'put',
    parameters
  }
}

export { doAddProjects, getAddProjectsEndpointParameters }
