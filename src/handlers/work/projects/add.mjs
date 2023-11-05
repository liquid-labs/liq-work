import { doAddProjects, getAddProjectsEndpointParameters } from './_lib/add-lib'

const { help, method, parameters } = getAddProjectsEndpointParameters({
  alternateTo : {
    altId     : '/work/projects/add',
    variation : 'explicitly name the unit of work'
  },
  workDesc : 'named'
})

const path = ['work', ':workKey', 'projects', 'add']

const func = ({ app, cache, reporter }) => async(req, res) => {
  const { workKey } = req.vars

  await doAddProjects({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
