import { doRemoveIssues, getIssuesRemoveEndpointParameters } from './_lib/remove-lib'

const { help, method, parameters } = getIssuesRemoveEndpointParameters({ workDesc : 'named' })

const path = ['work', ':workKey', 'issues', 'remove']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doRemoveIssues({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
