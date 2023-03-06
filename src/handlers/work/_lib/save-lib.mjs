import * as fsPath from 'node:path'

import createError from 'http-errors'

import {
  determineCurrentBranch,
  determineIfUnstagedChanges,
  determineIfUncommittedChanges
} from '@liquid-labs/git-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { getCommonImpliedParameters } from './common-implied-parameters'
import { determineProjects } from './determine-projects'
import { WorkDB } from './work-db'

const doSave = async({
  all,
  app,
  backupOnly,
  cache,
  description,
  noBackup,
  projects,
  workKey,
  reporter,
  req,
  res,
  summary
}) => {
  if (backupOnly !== true && summary === undefined) {
    throw createError.BadRequest("You must specify 'summary' when saving local changes (committing).")
  }

  const workDB = new WorkDB({ app, cache });

  ([projects, workKey] =
    await determineProjects({ all, cliEndpoint : 'work save', projects, reporter, req, workDB, workKey }))

  for (const projectFQN of projects) {
    const [org, project] = projectFQN.split('/')
    const projectPath = fsPath.join(app.liq.playground(), org, project)
    const currBranch = determineCurrentBranch({ projectPath, reporter })
    reporter.push(`Processing <code>${projectFQN}<rst>...`)
    if (currBranch !== workKey) {
      reporter.push(`  <em>skipping<rst>; not on work branch <code>${workKey}<rst>`)
      continue
    }

    if (backupOnly !== true) {
      if (determineIfUnstagedChanges({ projectPath /* We're handling the reporting */ })) {
        reporter.push('  <em>staging<rst> local changes')
        tryExec(`cd '${projectPath}' && git add .`)
      }
      else {
        reporter.push('  nothing to stage')
      }
      if (determineIfUncommittedChanges({ projectPath /* We're hanling the reporting  */ })) {
        reporter.push('  <em>committing<rst> local changes')
        const command = `cd '${projectPath}' && git commit -m '${summary}'`
          + (description === undefined ? '' : ` -m '${description}'`)
        tryExec(command)
      }
      else {
        reporter.push('  no changes to save')
      }
    }
    if (noBackup !== true) {
      reporter.push('  <em>pushing<rst> local changes')
      tryExec(`cd '${projectPath}' && git push`)
    }
  }

  httpSmartResponse({ msg : reporter.taskReport.join('\n'), req, res })
}

const getSaveEndpointParams = ({ descIntro }) => {
  const endpointParams = {
    help : {
      name        : 'Work save.',
      summary     : 'Commts and pushes work branch changes.',
      description : `${descIntro} By default, commits and pushes local changes. \`noBackup\` causes the process to commit, but not push. \`backupOnly\` causes the process to push without committing. If committing \`summary\` is required.`
    },
    method     : 'put',
    parameters : [
      {
        name        : 'backupOnly',
        isBoolean   : true,
        description : ''
      },
      {
        name        : 'description',
        description : 'Optional long form description of the changes, expanding on the `summary`.'
      },
      {
        name        : 'noBackup',
        isBoolean   : true,
        description : 'Skips the push, i.e., just commits.'
      },
      {
        name        : 'summary',
        description : 'Short, concise description of the changes.'
      },
      ...getCommonImpliedParameters({ actionDesc : 'save' })
    ].sort((a, b) => a.name.localeCompare(b.name))
  }

  Object.freeze(endpointParams.parameters)

  return endpointParams
}

export { doSave, getSaveEndpointParams }
