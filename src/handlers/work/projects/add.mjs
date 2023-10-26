import { doAddProjects, getAddProjectsEndpointParameters } from './_lib/add-lib'

const { help, method, parameters } = getAddProjectsEndpointParameters({ workDesc : 'named' })

const path = ['work', ':workKey', 'projects', 'add']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doAddProjects({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
