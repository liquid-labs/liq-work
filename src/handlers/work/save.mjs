import { getSaveEndpointParams, doSave } from './_lib/save-lib'

const { help, method, parameters } = getSaveEndpointParams({
  alternateTo : {
    altId     : '/work/save',
    variation : 'explicitly name the unit of work'
  },
  descIntro : 'Saves the changes associated with the current unit of work by committing and pushing local changes.'
})

const path = ['work', ':workKey', 'save']

const func = ({ app, cache, reporter }) => async(req, res) => {
  await doSave({ ...req.vars, all : false, app, cache, reporter, req, res })
}

export { func, help, parameters, path, method }
