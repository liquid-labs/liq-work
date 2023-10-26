import { doListIssues, getIssuesListEndpointParameters } from './_lib/list-lib'

const { help, method, parameters } = getIssuesListEndpointParameters({ workDesc : 'named' })

const path = ['work', ':workKey', 'issues', 'list']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doListIssues({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
