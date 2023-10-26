import * as fsPath from 'node:path'

import createError from 'http-errors'

import { determineCurrentBranch, determineOriginAndMain, verifyClean } from '@liquid-labs/git-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { LIQ_PLAYGROUND } from '@liquid-labs/liq-defaults'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { WorkDB } from './_lib/work-db'

// TODO: https://github.com/liquid-labs/liq-work/issues/52 allow non-main switches in certain circumstances
const help = 'Resumes the named unit of work, switching each involved project back to the work branch and re-installing the package. This is an all or nothing process and it will fail with no changes unless all the projects are currently on main branch or target work branch and clean.'

const method = 'put'

const parameters = []

const path = ['work', ':workKey', 'resume']

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const { workKey } = req.vars

  const workDB = new WorkDB({ app, cache })

  const workUnit = workDB.requireData(workKey)

  const projectsToSwitch = []
  const projectsSkipped = []
  for (const { name: projectFQN } of workUnit.projects) {
    const [org, project] = projectFQN.split('/')
    const projectPath = fsPath.join(LIQ_PLAYGROUND(), org, project)

    const currBranch = await determineCurrentBranch({ projectPath, reporter })

    const [, main] = determineOriginAndMain({ projectPath, reporter })
    if (currBranch === main) {
      verifyClean({ projectPath, reporter })
      projectsToSwitch.push({ currBranch, projectFQN, projectPath })
    }
    else {
      if (currBranch === workKey) {
        reporter.push(`<em>Skipping<rst> project <code>${projectFQN}<rst>; already on work branch <code>${workKey}<rst>.`)
        projectsSkipped.push({ projectFQN, projectPath })
      }
      else {
        throw createError.BadRequest(`Project '${projectFQN}' is on non-main, non-target work branch '${currBranch}'; resume aborted.`)
      }
    }
  }
  // if we get here, then everything is clean

  for (const { currBranch, projectFQN, projectPath } of projectsToSwitch) {
    reporter.push(`<em>Switching<rst> project <code>${projectFQN}<rst> from <code>${currBranch}<rst> to <code>${workKey}<rst>...`)

    // switch branch to main
    tryExec(`cd '${projectPath}' && git checkout ${workKey}`)
    tryExec(`cd '${projectPath}' && npm install`)
  }

  for (const { projectPath } of projectsSkipped) {
    tryExec(`cd '${projectPath}' && npm install`)
  }

  const msg = reporter.taskReport.join('\n') + '\n\n'
    + (projectsToSwitch.length > 0
      ? `<em>Switched projects <code>${projectsToSwitch.map((p) => p.projectFQN).join('<rst>, <code>')}<rst> to <code>${workKey}<rst> branch and <em>re-installed<rst> package.`
      : '')
    + (projectsSkipped.length > 0
      ? `<em>Projects <code>${projectsSkipped.map((p) => p.projectFQN).join('<rst>, <code>')}<rst> already on main; <em>re-installed<rst> package.`
      : '')
  httpSmartResponse({ msg, req, res })
}

export { func, help, method, parameters, path }
