import { doAddProjects, getAddProjectsEndpointParameters } from './_lib/add-lib'
import { requireImpliedBranch } from '../_lib/require-implied-work'

const { help, method, parameters } = getAddProjectsEndpointParameters({ workDesc : 'named' })

const path = ['work', 'projects', 'add']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const workKey = await requireImpliedBranch({ reporter, req })

  await doAddProjects({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
