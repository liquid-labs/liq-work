import { doSubmit, getSubmitEndpointParams } from './_lib/submit-lib'

const { help, method, parameters } = getSubmitEndpointParams({
  alternateTo : {
    altId     : '/work/submit',
    variation : 'explicitly name the unit of work'
  },
  descIntro : 'Submits the changes associated with a unit of work by creating a pull request for the changes in each project associated with the unit of work.'
})

const path = ['work', ':workKey', 'submit']

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  await doSubmit({ ...req.vars, all : false, app, cache, reporter, req, res })
}

export { func, help, parameters, path, method }
