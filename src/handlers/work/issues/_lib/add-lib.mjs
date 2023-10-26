import { claimIssues, getGitHubOrgAndProjectBasename, verifyIssuesAvailable } from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { Octocache } from '@liquid-labs/octocache'

import { commonAssignParameters } from '../../_lib/common-assign-parameters'
import { WorkDB } from '../../_lib/work-db'

const doAddIssues = async({ app, cache, reporter, req, res, workKey }) => {
  reporter = reporter.isolate()

  let { assignee, comment, issues, noAutoAssign } = req.vars

  const credDB = app.ext.credentialsDB
  const authToken = await credDB.getToken('GITHUB_API')
  const workDB = new WorkDB({ app, authToken, reporter })

  // normalize the issue spec; add default project to issues
  const workData = workDB.requireData(workKey)
  // normalize the issue references
  const primaryProject = workData.projects[0].name
  const { pkgJSON } = app.ext._liqProjects.playgroundMonitor.getProjectData(primaryProject)

  const { org: ghOrg, projectBasename } = getGitHubOrgAndProjectBasename({ packageJSON : pkgJSON })
  issues = issues.map((i) => i.match(/^\d+$/) ? ghOrg + '/' + projectBasename + '/' + i : i)

  await verifyIssuesAvailable({ authToken, issues, noAutoAssign, notClosed : true, reporter })
  await claimIssues({ assignee, authToken, comment, issues, reporter })

  const updatedWorkData = await workDB.addIssues({ issues, workKey })

  httpSmartResponse({
    data : updatedWorkData,
    msg  : `Added '<em>${issues.join("<rst>', '<em>")}<rst>' to unit of work '<em>${workKey}<rst>'.`,
    req,
    res
  })
}

const getIssuesAddEndpointParameters = ({ workDesc }) => {
  const help = {
    name        : 'Work issues add',
    summary     : `Add issues to the ${workDesc} unit of work.`,
    description : `Adds one or more issues to the ${workDesc} unit of work.`
  }

  const method = 'put'

  const parameters = [...commonAssignParameters()]

  parameters.find((p) => p.name === 'issues').optionsFunc = issueOptionsFunc
  Object.freeze(parameters)

  return { help, method, parameters }
}

const issueOptionsFunc = async({ app, cache, workKey }) => {
  const credDB = app.ext.credentialsDB
  const authToken = await credDB.getToken('GITHUB_API')
  const octocache = new Octocache({ authToken })

  const workDB = new WorkDB({ app })

  const projects = workDB.getData(workKey).projects?.map((p) => p.name)
  if (projects === undefined) return []

  const options = []
  for (const project of projects) {
    const issues = await octocache.paginate(`GET /repos/${project}/issues`, { state : 'open' })
    // TODO: use constant for 'assigned'
    options.push(...issues
      .filter((i) => !i.labels.some((l) => l.name === 'assigned'))
      // eslint-disable-next-line prefer-regex-literals
      .map((i) => i.url.replace(new RegExp('.+/repos/([^/]+)/([^/]+)/issues/(\\d+).*'), '$1/$2/$3'))
    )
  }

  return options
}

export { doAddIssues, getIssuesAddEndpointParameters }
