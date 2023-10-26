import { doListProjects, getListProjectsEndpointParameters } from './_lib/list-lib'
import { requireImpliedBranch } from '../_lib/require-implied-work'

const { help, method, parameters } = getListProjectsEndpointParameters({ workDesc : 'named' })

const path = ['work', 'projects', 'list']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const workKey = await requireImpliedBranch({ reporter, req })

  await doListProjects({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
