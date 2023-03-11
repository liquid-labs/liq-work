import { getSaveEndpointParams, doSave } from './_lib/save-lib'

const { help, method, parameters } = getSaveEndpointParams({ descIntro : 'Saves the changes associated with the current unit of work by committing and pushing local changes.' })

const path = ['work', ':workKey', 'save']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doSave({ all : false, app, cache, workKey, reporter, req, res })
}

export { func, help, parameters, path, method }
