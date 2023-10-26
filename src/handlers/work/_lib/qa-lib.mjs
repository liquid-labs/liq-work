import * as fs from 'node:fs/promises'
import * as fsPath from 'node:path'

import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { getCommonImpliedParameters } from './common-implied-parameters'
import { determineProjects } from './determine-projects'
import { WorkDB } from './work-db'

const doQA = async({ app, cache, reporter, req, res, workKey }) => {
  const { all } = req.vars
  let { projects } = req.vars

  const workDB = new WorkDB({ app, reporter });

  ([projects, workKey] =
    await determineProjects({ all, cliEndpoint : 'work qa', projects, reporter, req, workDB, workKey }))

  let msg = ''

  for (const projectFQN of projects) {
    const { projectPath } = app.ext._liqProjects.playgroundMonitor.getProjectData(projectFQN)

    tryExec(`cd '${projectPath}' && npm run qa`, { noThrow : true })

    for (const file of await fs.readdir(projectPath, { encoding : 'utf8' })) {
      if (file.match(/last-.+\.txt/)) {
        const qaType = file.replace(/last-(.+)\.txt/, '$1')
        msg += '\n' + '<h1>' + qaType.charAt(0).toUpperCase() + qaType.slice(1) + ' for ' + projectFQN + '<rst>\n\n'
        const filePath = fsPath.join(projectPath, file)
        msg += await fs.readFile(filePath, { encoding : 'utf8' })
      }
    }
  }

  httpSmartResponse({ msg, req, res })
}

const getQAEndpointParams = ({ workDesc }) => ({
  help : {
    name        : `Work qa (${workDesc})`,
    summary     : 'QAs work involved projects.',
    description : `QAs one or more projects associated with the ${workDesc} unit of work.`
  },
  method     : 'put',
  parameters : getCommonImpliedParameters({ actionDesc : 'qa' })
})

export { doQA, getQAEndpointParams }
