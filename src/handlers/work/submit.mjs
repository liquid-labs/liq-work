import { doSubmit, getSubmitEndpointParams } from './_lib/submit-lib'

const { help, method, parameters } = getSubmitEndpointParams({ descIntro : 'Submits the changes associated with a unit of work by creating a pull request for the changes in each project associated with the unit of work.' })

const path = ['work', ':workKey', 'submit']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { projects, workKey } = req.vars

  await doSubmit({ all : false, app, cache, projects, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
