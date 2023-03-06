import createError from 'http-errors'

import { determineImpliedProject } from '@liquid-labs/liq-projects-lib'

const determineProjects = ({ all, cliEndpoint, projects, reporter, req, workDB, workKey }) => {
  // first, we determine the work key
  let currDir
  if (workKey === undefined) {
    currDir = req.get('X-CWD')
    if (currDir === undefined) {
      throw createError.BadRequest(`Called '${cliEndpoint}' with implied work, but 'X-CWD' header not found.`)
    }

    workKey = determineCurrentBranch({ projectPath : currDir, reporter })
  }

  const workUnit = workDB.requireData(workKey)

  if (all === true) { // overrides anything other setting
    projects = workUnit.projects.map((wu) => wu.name)
  }
  else if (projects === undefined) {
    projects = [determineImpliedProject({ currDir })]
  }
  else { // else projects is defined, let's make sure they're valid
    // remove duplicates in the list
    projects = projects.filter((p, i, arr) => arr.indexOf(p) === i)

    for (const projectFQN of projects) {
      if (!workProjects.find((p) => p.name === projectFQN)) {
        throw createError.BadRequest(`No such project to save: '${projectFQN}'.`)
      }
    }
  }

  return [ projects, workUnit ]
}

export { determineProjects }