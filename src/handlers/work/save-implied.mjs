import { getSaveEndpointParams, doSave } from './_lib/save-lib'

const { help, method, parameters } = getSaveEndpointParams({ descIntro : 'Saves the changes associated with the current unit of work by committing and pushing local changes.' })

const path = ['work', 'save']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { all = false, backupOnly = false, description, noBackup = false, projects, summary } = req.vars

  await doSave({ all, app, backupOnly, cache, description, noBackup, projects, reporter, req, res, summary })
}

export { func, help, parameters, path, method }
