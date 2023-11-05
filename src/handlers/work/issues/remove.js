import { doRemoveIssues, getIssuesRemoveEndpointParameters } from './_lib/remove-lib'

const { help, method, parameters } = getIssuesRemoveEndpointParameters({
  alternateTo: {
    altId: '/work/issues/remove',
    variation: 'explicitly name the unit of work'
  },
  workDesc : 'named' })

const path = ['work', ':workKey', 'issues', 'remove']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doRemoveIssues({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
