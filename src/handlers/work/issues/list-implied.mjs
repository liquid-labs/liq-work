import { doListIssues, getIssuesListEndpointParameters } from './_lib/list-lib'
import { requireImpliedBranch } from '../_lib/require-implied-work'

const { help, method, parameters } = getIssuesListEndpointParameters({ workDesc : 'current' })

const path = ['work', 'issues', 'list']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const workKey = await requireImpliedBranch({ reporter, req })

  await doListIssues({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
