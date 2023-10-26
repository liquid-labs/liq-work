import { getSaveEndpointParams, doSave } from './_lib/save-lib'

const { help, method, parameters } = getSaveEndpointParams({ descIntro : 'Saves the changes associated with the current unit of work by committing and pushing local changes.' })

const path = ['work', 'save']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { all = false } = req.vars

  await doSave({ all, app, cache, reporter, req, res })
}

export { func, help, parameters, path, method }
