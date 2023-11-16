import * as fsPath from 'node:path'

import createError from 'http-errors'

import { determineCurrentBranch, determineOriginAndMain, verifyClean } from '@liquid-labs/git-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { PLUGABLE_PLAYGROUND } from '@liquid-labs/plugable-defaults'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { WorkDB } from './work-db'

const doPause = async({ app, cache, reporter, req, res, workKey }) => {
  reporter = reporter.isolate()

  if (workKey === undefined) {
    const currDir = req.get('X-CWD')
    if (currDir === undefined) {
      throw createError.BadRequest('Called \'work pause\' with implied work, but \'X-CWD\' header not found.')
    }

    workKey = await determineCurrentBranch({ projectPath : currDir, reporter })
  }

  const workDB = new WorkDB({ app, cache })

  const workUnit = workDB.requireData(workKey)

  const projectsToSwitch = []
  const projectsSkipped = []
  for (const { name: projectFQN } of workUnit.projects) {
    const [org, project] = projectFQN.split('/')
    const projectPath = fsPath.join(PLUGABLE_PLAYGROUND(), org, project)

    const currBranch = await determineCurrentBranch({ projectPath, reporter })

    const [, main] = determineOriginAndMain({ projectPath, reporter })
    if (currBranch === workKey) {
      verifyClean({ projectPath, reporter })
      projectsToSwitch.push({ currBranch, main, projectFQN, projectPath })
    }
    else {
      if (currBranch === main) {
        reporter.push(`<em>Skipping<rst> project <code>${projectFQN}<rst>; already on main branch <code>${main}<rst>.`)
        projectsSkipped.push({ projectFQN, projectPath })
      }
      else {
        throw createError.BadRequest(`Project '${projectFQN}' is on non-main, non-current work branch '${currBranch}'; pause aborted.`)
      }
    }
  }
  // if we get here, then everything is clean

  for (const { currBranch, main, projectFQN, projectPath } of projectsToSwitch) {
    reporter.push(`<em>Switching<rst> project <code>${projectFQN}<rst> from <code>${currBranch}<rst> to <code>${main}<rst>...`)

    // switch branch to main
    tryExec(`cd '${projectPath}' && git checkout ${main}`)
    tryExec(`cd '${projectPath}' && npm install`)
  }

  for (const { projectPath } of projectsSkipped) {
    tryExec(`cd '${projectPath}' && npm install`)
  }

  const msg = reporter.taskReport.join('\n') + '\n\n'
    + (projectsToSwitch.length > 0
      ? `<em>Switched projects <code>${projectsToSwitch.map((p) => p.projectFQN).join('<rst>, <code>')}<rst> to main branch and <em>re-installed<rst> package.`
      : '')
    + (projectsSkipped.length > 0
      ? `<em>Projects <code>${projectsSkipped.map((p) => p.projectFQN).join('<rst>, <code>')}<rst> already on main; <em>re-installed<rst> package.`
      : '')
  httpSmartResponse({ msg, req, res })
}

const getPauseEndpointParams = ({ alternateTo, desc }) => ({
  help : {
    alternateTo,
    name        : 'Pause work',
    summary     : `Pauses the ${desc} unit of work.`,
    description : `Pauses the ${desc} unit of work, switching each involved project back to the main branch and re-installing the package. This is an all or nothing process and it will fail with no changes unless all the projects are currently on the work branch and clean or on the main branch (in any state).`
  },
  method     : 'put',
  parameters : []
})

export {
  doPause,
  getPauseEndpointParams
}
