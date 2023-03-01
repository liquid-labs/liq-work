import { getSaveEndpointParams, doSave } from './_lib/save-lib'

const { help, method, parameters } = getSaveEndpointParams({ descIntro : 'Saves the changes associated with the current unit of work by committing and pushing local changes.' })

const path = ['work', ':workKey', 'save']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { backupOnly = false, description, noBackup = false, summary, workKey } = req.vars
  const { projects } = req.vars

  doSave({ app, backupOnly, cache, description, noBackup, projects, workKey, reporter, req, res, summary })
}

export { func, help, parameters, path, method }
