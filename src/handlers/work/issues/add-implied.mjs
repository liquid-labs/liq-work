import { doAddIssues, getIssuesAddEndpointParameters } from './_lib/add-lib'
import { requireImpliedBranch } from '../_lib/require-implied-work'

const { help, method, parameters } = getIssuesAddEndpointParameters({ workDesc : 'current' })

const path = ['work', 'issues', 'add']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const workKey = await requireImpliedBranch({ reporter, req })

  await doAddIssues({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
