import { doRemoveProjects, getRemoveProjectsEndpointParameters } from './_lib/remove-lib'

const { help, method, parameters } = getRemoveProjectsEndpointParameters({ workDesc : 'named' })

const path = ['work', ':workKey', 'projects', 'remove']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doRemoveProjects({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
