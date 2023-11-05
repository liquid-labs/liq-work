import { doAddIssues, getIssuesAddEndpointParameters } from './_lib/add-lib'

const { help, method, parameters } = getIssuesAddEndpointParameters({
  alternateTo : {
    altId     : '/work/issues/add',
    variation : 'explicitly name the unit of work'
  },
  workDesc : 'named'
})

const path = ['work', ':workKey', 'issues', 'add']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doAddIssues({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
