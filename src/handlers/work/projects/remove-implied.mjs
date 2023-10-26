import { doRemoveProjects, getRemoveProjectsEndpointParameters } from './_lib/remove-lib'
import { requireImpliedBranch } from '../_lib/require-implied-work'

const { help, method, parameters } = getRemoveProjectsEndpointParameters({ workDesc : 'named' })

const path = ['work', 'projects', 'remove']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const workKey = await requireImpliedBranch({ reporter, req })

  await doRemoveProjects({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
