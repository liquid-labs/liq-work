import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'
import { getPackageJSON } from '@liquid-labs/npm-toolkit'

const determineProjects = async({ all, cliEndpoint, projects, reporter, req, workDB, workKey }) => {
  // first, we determine the work key
  const currDir = req.get('X-CWD')
  if (workKey === undefined) {
    requireCurrDir({ cliEndpoint, currDir })

    workKey = await determineCurrentBranch({ projectPath : currDir, reporter })
  }

  const workUnit = workDB.requireData(workKey)

  if (all === true) { // overrides anything other setting
    projects = workUnit.projects.map((wu) => wu.name)
  }
  else if (projects === undefined) {
    const currDir = req.get('X-CWD')
    const currProject = (await getPackageJSON({ pkgDir: currDir })).name
    projects = [currProject]
  }
  else { // else projects is defined, let's make sure they're valid
    // remove duplicates in the list
    projects = projects.filter((p, i, arr) => arr.indexOf(p) === i)

    for (const projectFQN of projects) {
      if (!workUnit.projects.find((p) => p.name === projectFQN)) {
        throw createError.BadRequest(`No such project to save: '${projectFQN}'.`)
      }
    }
  }

  return [projects, workKey, workUnit]
}

const requireCurrDir = ({ cliEndpoint, currDir }) => {
  if (currDir === undefined) {
    throw createError.BadRequest(`Called '${cliEndpoint}' with implied work, but 'X-CWD' header not found.`)
  }
}

export { determineProjects }
