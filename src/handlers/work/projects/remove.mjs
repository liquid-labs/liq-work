import createError from 'http-errors'

import { httpSmartResponse } from '@liquid-labs/http-smart-response'

import { WorkDB } from '../_lib/work-db'

const help = {
  name        : 'Work projects remove',
  summary     : 'Remove projects from a unit of work.',
  description : 'Removes projects from the indicated unit of work.'
}

const method = 'delete'
const path = ['work', ':workKey', 'projects', 'remove']

const parameters = [
  {
    name         : 'projects',
    isMultivalue : true,
    descirption  : 'Specifies the project to remove from the unit of work. May be specified multiple times.',
    optionsFunc  : ({ app, workKey }) => {
      const workDB = new WorkDB({ app })
      return workDB.getData(workKey).projects.map((p) => p.name)
    }
  }
]
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { projects, workKey } = req.vars

  const workDB = new WorkDB({ app, reporter })
  const workData = workDB.getData(workKey)
  if (workData === undefined) {
    throw createError.NotFound(`No such active unit of work '${workKey}'.`)
  }
  // TODO: do some checking... https://github.com/liquid-labs/liq-work/issues/7

  const updatedWorkData = workDB.removeProjects({ workKey, projects })

  httpSmartResponse({
    data : updatedWorkData,
    msg  : `Removed projects '<em>${projects.join("<rst>', '<em>")}<rst>' from unit of work '<em>${workKey}<rst>'.`,
    req,
    res
  })
}

export { func, help, parameters, path, method }
