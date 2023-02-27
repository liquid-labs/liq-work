import * as fsPath from 'node:path'

import createError from 'http-errors'

import { determineCurrentBranch, determineOriginAndMain, hasBranch, verifyClean } from '@liquid-labs/git-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { WorkDB } from '../_lib/work-db'

const help = {
  name        : 'Work projects remove',
  summary     : 'Remove projects from a unit of work.',
  description : 'Removes projects from the indicated unit of work. If the work branch is the current working branch for the repo, then it must be clean (unless `allowUnclean` is specified). If the work branch is present, it must have no un-merged changes (unless `forgetChanges` is specified). If the current repo branch is anything other than the work branch, then it is left in place.'
}

const method = 'delete'
const path = ['work', ':workKey', 'projects', 'remove']

const parameters = [
  {
    name        : 'allowUnclean',
    isBoolean   : true,
    description : 'Will attempt to switch from the working branch to the main branch even if the working branch is not clean.'
  },
  {
    name        : 'forgetChanges',
    isBoolean   : true,
    description : 'Will forget/drop any changes on the work branch.'
  },
  {
    name         : 'projects',
    isMultivalue : true,
    descirption  : 'Specifies the project to remove from the unit of work. May be specified multiple times.',
    optionsFunc  : ({ app, workKey }) => {
      const workDB = new WorkDB({ app })
      return workDB.getData(workKey).projects.map((p) => p.name)
    }
  }
]
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const { allowUnclean = false, forgetChanges = false, projects, workKey } = req.vars

  const workDB = new WorkDB({ app, reporter })
  const workData = workDB.getData(workKey)
  if (workData === undefined) {
    throw createError.NotFound(`No such active unit of work '${workKey}'.`)
  }

  let updatedWorkData
  const removed = []
  const left = []
  for (const projectFQN of projects) {
    const [org, project] = projectFQN.split('/')

    const projectPath = fsPath.join(app.liq.playground(), org, project)

    let hasWorkBranch
    let switchToMain = true
    const currBranch = determineCurrentBranch({ projectPath, reporter })
    if (currBranch === workKey) {
      hasWorkBranch = true
      if (allowUnclean !== true) {
        verifyClean({ projectPath, reporter })
      }
    }
    else {
      hasWorkBranch = hasBranch({ branch : workKey, projectPath, reporter })
      switchToMain = false
    }

    if (hasWorkBranch) {
      const [, main] = determineOriginAndMain({ projectPath, reporter })
      const noUnmergedChanges = // TODO: fetch main first?
        tryExec(`cd '${projectPath}' && git branch --contains ${workKey} ${main}`).stdout.trim().length > 0
      const okToDeleteWB = forgetChanges === true || noUnmergedChanges

      if (okToDeleteWB === true) {
        if (switchToMain) {
          reporter.push(`Switching to '<code>${main}<rst>' branch...`)
          tryExec(`cd '${projectPath}' && git checkout ${main}`)
        }
        reporter.push(`Work branch '<code>${workKey}<rst>' ${noUnmergedChanges === true ? 'has no un-merged changes' : 'changes will be forgot'}, <em>deleting<rst>...`)
        tryExec(`cd '${projectPath}' && git branch -${forgetChanges === true ? 'D' : 'd'} ${workKey}`)
        updatedWorkData = workDB.removeProjects({ workKey, projects : [projectFQN] })
        removed.push(projectFQN)
      }
      else {
        reporter.push(`Work branch '<code>${workKey}<rst>' looks to have un-merged changes; <em>leaving<rst> in place.`)
        left.push(projectFQN)
      }
    }
    else { // does not have work branch....
      reporter.push(`No work branch '<code>${workKey}<rst>' found in project '<code>${projectFQN}<rst>'; <em>removing<rst> project from unit of work...`)
      updatedWorkData = workDB.removeProjects({ workKey, projects : [projectFQN] })
      removed.push(projectFQN)
    }
  }

  const msg = reporter.taskReport.join('\n') + '\n\n'
    + (removed.length > 0 ? `<em>Removed<rst> '<code>${removed.join("<rst>', '<code>")}<rst>' projects from` : '')
    + (removed.length > 0 && left.length > 0 ? ' and <em>l' : '<em>L')
    + (left.length > 0 ? `eft<rst> '<code>${left.join("<rst>', '<code>")}<rst>' in` : '')
    + ` unit of work <code>${workKey}<rst>.`

  httpSmartResponse({
    data : updatedWorkData,
    msg,
    req,
    res
  })
}

export { func, help, parameters, path, method }
