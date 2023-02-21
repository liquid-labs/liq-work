import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'

import { WorkDB } from '../_lib/work-db'

const help = {
  name        : 'Work projects add',
  summary     : 'Add projects to a unit of work.',
  description : 'Adds one or more projects to an existing working of work.'
}

const method = 'put'
const path = ['work', ':workKey', 'projects', 'add']

const parameters = [
  {
    name         : 'projects',
    isMultivalue : true,
    description  : 'The project to add to the unit of work. May be specify multiple projects.',
    optionsFunc  : ({ app, cache, model, workKey }) => {
      const credDB = new CredentialsDB({ app, cache })
      const authToken = credDB.getToken(purposes.GITHUB_API)
      const workDB = new WorkDB({ app, authToken })
      const currProjects = workDB.getData(workKey).projects?.map((p) => p.name)

      return Object.keys(model.playground.projects).filter((p) => !currProjects.includes(p))
    }
  }
]
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const { projects, workKey } = req.vars

  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)
  const workDB = new WorkDB({ app, authToken, reporter })

  const updatedWorkData = await workDB.addProjects({ authToken, projects, reporter, workKey })

  httpSmartResponse({
    data : updatedWorkData,
    msg  : `${reporter.taskReport.join('\n')}

Added projects '<em>${projects.join("<rst>', '<em>")}<rst>' to unit of work '<em>${workKey}<rst>'.`,
    req,
    res
  })
}

export { func, help, parameters, path, method }
