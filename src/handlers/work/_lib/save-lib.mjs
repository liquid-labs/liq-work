import { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as fsPath from 'node:path'

import createError from 'http-errors'

import {
  determineCurrentBranch,
  determineIfUnstagedChanges,
  determineIfUncommittedChanges
} from '@liquid-labs/git-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { determineImpliedProject } from '@liquid-labs/liq-projects-lib'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { getCommonImpliedParameters } from './common-implied-parameters'
import { determineProjects } from './determine-projects'
import { WorkDB } from './work-db'

const doSave = async({
  all,
  app,
  cache,
  workKey,
  reporter,
  req,
  res
}) => {
  reporter = reporter.isolate()

  const { backupOnly = false, description, files, noBackup = false, projects, summary } = req.vars

  if (backupOnly !== true && summary === undefined) {
    throw createError.BadRequest("You must specify 'summary' when saving local changes (committing).")
  }
  if (files !== undefined && projects !== undefined) {
    throw createError.BadRequest("Parameters 'projecs' and 'files' are incompatible; please use one or the other.")
  }

  if (files !== undefined) {
    saveFiles({ app, backupOnly, description, files, noBackup, reporter, req, summary })
  }
  else {
    await saveProjects({
      all,
      app,
      backupOnly,
      cache,
      description,
      noBackup,
      projects,
      reporter,
      req,
      summary,
      workKey
    })
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
        name         : 'files',
        isMultivalue : true,
        description  : "Rather than saving everything, save only the indicated files. Files are specified in the form '[org/project:]rel/path/to/file'. When the project designation is omitted, the current project is assumed.",
        optionsFunc  : async({ app, cache, lastOptionValue, req, workKey }) => {
          const currDir = req.get('X-CWD')
          const [impOrg, impProj] = determineImpliedProject({ currDir }).split('/')
          const impliedProjectFQN = impOrg + '/' + impProj
          workKey = workKey || determineCurrentBranch({ projectPath : currDir })

          const workDB = new WorkDB({ app, cache })

          const projectOptions = () => workDB.requireData(workKey).projects
            .map((p) => p.name + ':')
            .filter((p) => p !== impOrg + '/' + impProj + ':')

          const fileOptions = async({ relPath, partial, projectFQN, terminal }) => {
            console.log('relPath:', relPath, 'partial:', partial)

            const pathBits = [app.liq.playground(), ...projectFQN.split('/')]
            if (relPath !== undefined) {
              pathBits.push(relPath)
            }
            const filePath = fsPath.join(...pathBits)
            try {
              const stats = await fs.stat(filePath)
              if (stats.isDirectory()) {
                // then our result is the contents of the directory
                const dirEnts = await fs.readdir(filePath, { withFileTypes : true })
                const opts = dirEnts.map((d) => {
                  // we need te propend the relpath (with '/' where needed)
                  let opt = relPath || ''
                  if (relPath && !relPath.endsWith('/')) {
                    opt += '/'
                  }
                  opt += d.name
                  // and if the entry is a direcory, end with a '/'
                  if (d.isDirectory()) {
                    opt += '/'
                  }
                  return opt
                })

                return opts
              }
              else {
                return fsPath.basename(relPath)
              }
            }
            catch (e) {
              // the 'ENOENT' error comes from trying to 'stat' a file. If we have a partial, then that will fail, but
              // knocking off the partial will gives us the actual dir, so that's what we do here. However, we don't
              // need to go further than one level because if that fails, indicated by the 'terminal' param.
              if (e.code === 'ENOENT' && terminal !== true) {
                return await fileOptions({
                  relPath  : relPath ? fsPath.dirname(relPath) : '',
                  partial  : relPath ? fsPath.basename(relPath) : partial,
                  projectFQN,
                  terminal : true
                })
              }
              else { return [] }
            }
          }

          if (!lastOptionValue || lastOptionValue.trim() === '') {
            return projectOptions().concat(await fileOptions({ projectFQN : impliedProjectFQN }))
          }
          else if (lastOptionValue.indexOf(':') !== -1) {
            const [projectFQN, relPath] = lastOptionValue.split(':')
            return await fileOptions({ projectFQN, relPath })
          }
          else {
            return projectOptions().filter((p) => p.startsWith(lastOptionValue))
              .concat(await fileOptions({ projectFQN : impliedProjectFQN, relPath : lastOptionValue }))
          }
        }
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

const saveFiles = ({ app, backupOnly, description, files, noBackup, reporter, req, summary }) => {
  let impOrg, impProj
  files = files.map((f) => {
    if (f.indexOf(':') === -1) {
      if (impProj === undefined) {
        const currDir = req.get('X-CWD');
        ([impOrg, impProj] = determineImpliedProject({ currDir }).split('/'))
      }

      return [impOrg, impProj, f, fsPath.join(app.liq.playground(), impOrg, impProj)]
    }
    else {
      const [projectFQN, relFile] = f.split(':')
      const [org, proj] = projectFQN.split('/')
      return [org, proj, relFile, fsPath.join(app.liq.playground(), org, proj)]
    }
  })
  // 'files' now a list of [ org, proj, relFile ]

  for (const [org, proj, relFile, repoPath] of files) {
    const filePath = fsPath.join(repoPath, relFile)

    if (!existsSync(filePath)) {
      throw createError.NotFound(`No such file '${org}/${proj}:${relFile}' found to save.`)
    }
    else if (tryExec(`cd '${repoPath}' && git status --porcelain=v1 -- ${relFile}`).stdout.trim().length === 0) {
      throw createError.BadRequest(`File '${org}/${proj}:${relFile}' is unchanged.`)
    }
  }
  // we've now verified everything

  const projectIndex = {}
  for (const [org, proj, relFile, repoPath] of files) {
    if (backupOnly !== true) {
      reporter.push(`Staging ${org}/${proj}:${relFile}...`)
      tryExec(`cd '${repoPath}' && git add ${relFile}`)
    }
    projectIndex[org + '/' + proj] = repoPath
  }
  if (noBackup !== true) {
    for (const [projectFQN, repoPath] of Object.entries(projectIndex)) {
      reporter.push(`Committing and pushing changes in ${projectFQN}...`)
      const commitCommand = `cd '${repoPath}' && git commit -m '${summary.replaceAll(/'/g, '\'"\'"\'')}'`
        + (description === undefined ? '' : ` -m '${description.replaceAll(/'/g, '\'"\'"\'')}'`)
      tryExec(commitCommand)
      tryExec(`cd '${repoPath}' && git push`)
    }
  }
}

const saveProjects = async({
  all,
  app,
  backupOnly,
  cache,
  description,
  noBackup,
  projects,
  reporter,
  req,
  summary,
  workKey
}) => {
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
        const command = `cd '${projectPath}' && git commit -m '${summary.replaceAll(/'/g, '\'"\'"\'')}'`
          + (description === undefined ? '' : ` -m '${description.replaceAll(/'/g, '\'"\'"\'')}'`)
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
}

export { doSave, getSaveEndpointParams }
