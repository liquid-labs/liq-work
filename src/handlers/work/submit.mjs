import { doSubmit, getSubmitEndpointParams } from './_lib/submit-lib'

const { help, method, parameters } = getSubmitEndpointParams({ descIntro : 'Submits the changes associated with a unit of work by creating a pull request for the changes in each project associated with the unit of work.' })

const path = ['work', ':workKey', 'submit']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doSubmit({ app, cache, workKey, reporter, req, res })
}

export { func, help, parameters, path, method }
