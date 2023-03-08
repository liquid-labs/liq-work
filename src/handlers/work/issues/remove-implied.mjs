import { doRemoveIssues, getIssuesRemoveEndpointParameters } from './_lib/remove-lib'
import { requireImpliedBranch } from '../_lib/require-implied-work'

const { help, method, parameters } = getIssuesRemoveEndpointParameters({ workDesc : 'current' })

const path = ['work', 'issues', 'remove']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const workKey = await requireImpliedBranch({ reporter, req })

  await doRemoveIssues({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
