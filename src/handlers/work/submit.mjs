import createError from 'http-errors'

import { verifyBranchInSync, verifyClean } from '@liquid-labs/git-toolkit'
import { workBranchName } from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB } from '@liquid-labs/liq-credentials-db'
import { Octocache } from '@liquid-labs/octocache'

import { GH_BASE_URL, WORKSPACE } from './_lib/constants'
import { WorkDB } from './_lib/work-db'

const help = {
  name        : 'Work submit.',
  summary     : 'Submits changes for review and merging.',
  description : `Submits the changes associated with a unit of work by creating a pull request. By default, changes to all involved projects are submitted and all issues are closed by merging the pull request associated to the primary project of the unit of work and the projects status is marked as 'submitted' in the work DB, unless \`keepActive\` is specified.

If you have portions that are complete, you can use the \`project\` parameter. Only the specified projects will be included in the submission. In that case, the first project specified will be considered the close target unless \`closeTarget\` is specified, though by default no issues are closed in a partial submit unless \`closes\` is specified.

By default, the system assigns the pull request to the submitter. This may be overriden with the \`assignees\` parameter. Where the system is configured to support it, reviewers are assigned programatically by referencing the reviewer \'qualifications\'; alternatively, revewiers may be specified by \`reviewers\` parameter.

When no \`projects\`, no \`closes\` and \`noClose\` are __not__ specified, then the default is to designate the primary project as the \`closeTarget\` and note all issues as being closed when the close target pull request is merged. If the scope of the submission is limited by project or issue, then \`noClose\` is the default. In that situation, you can list specific issues closed via the \`closes\` parameter.

The close target is:
1. the project specified by \`closeTarget\`,
2. the first project listed explicitly by \`projects\`, or
3. the first project in the unit of work list of projects which is still active.`
}

const method = 'post'
const paths = [
  ['work', '.', 'submit'],
  ['work', ':workKey', 'submit'],
]
const parameters = [
  {
    name: 'assignees',
    isMultivalue: true,
    description: 'The pull-request will be assigned to the indicated assignee(s) rather than to the submitter'
    // optionsFunc : pull from qualified staff (attach qualifications to roles)
  },
  {
    name: 'closes',
    isMultivalue: true,
    description: `When specified, the effective close target is noted to close the issues. The specified issues must already be associated with the unit of work. Refer to the method description and \`closeTarget\` for information on the effective close target. Issues are specified in the form of &gt;org&lt;/&lt;project&gt;/&lt;issue number&gt;.

    the primary project in the unit of work or, where specified, the first project listed explicitly will be noted to close the specified issues.`
  },
  {
    name: 'closeTarget',
    description: 'The project which closes the issues associated with the submission. See method description and the`closes` parameter for more on the associated issues.'
  },
  {
    name: 'keepActive',
    description: "When specified, the status of the projects associated with the submission is left as 'active'. This can be useful when you expect further changes on the work branch, but you have a stable code base and merge-worthy interim updates. In other words, there's no bar to having multiple pull-requests+merges associated with a project within a unit of work, it's just that typically it all comes at the end in one go."
  },
  {
    name: 'noClosed',
    isBoolean: true,
    description: 'When set, then no issues are closed in a situation where they would otherwise be closed.'
  },
  {
    name         : 'projects',
    isMultivalue : true,
    description  : "Limits the project(s) whose changes are submitted to the specified projects. Projects are specified by a standard '&lt;org&gt;/&lt;project&gt;' ID."
    // optionsFunc  : from workDB; add a 'cache or read' function to WorkDB and use it for place like this.
  },
  {
    name: 'qualifications',
    isMultivalue: true,
    description: 'Limits the qualifications required to review the changes to the listed qualifications. Qualifications must be a subset of the project qualifications.'
  },
  {
    name: 'reviewers',
    isMultivalue: true,
    description: 'Specifies a '
  }
]
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  let { workKey } = req.vars
  if (workKey === undefined) { // then we're in a '.' call
    const clientCWD = req.get('X-CWD')
    if (clientCWD === undefined)
      throw createError.NotFound(`The '.' convention may not be used without providing a <code>X-CWD<rst> header.`)

    workKey = clientCWD.replace(new RegExp('(?:^|.*/)([^/]+/[^/]+)/?$'), '$1')
  }

  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)

  const workDB = new WorkDB({ app, reporter }) // doesn't need auth token

  const workUnit = workDB.getData(workKey)
  if (workUnit === undefined) throw createError.NotFound(`No such active unit of work '${workKey}' found.`)

  let { assignees, closes, noCloses, projects } = req.vars

  // determine assignee(s)
  if (assignees === undefined) {
    assignees = [ determineGitHubLogin({ authToken })]
  }

  // determine the projects to submit
  if (projects === undefined) {
    projects = workUnit.projects
  }
  else {
    // remove duplicates in the list
    projects = projects.filter(((p, i, arr) => i === arr.indexOf(p)))
    projects.forEach((p, i, arr) => {
      const project = workUnit.projects.find((wup) => wup.name === p)
      if (project === undefined)
        throw createError.NotFound(`No record of project <em>${p}<rst> in unit of work '${workKey}'.`)

      arr.splice(i, 1, project)
    })
  }
  // projects is now an array of project entries

  // we can now check if we are closing issues and which issues to close
  // because we de-duped, the lists would have equiv length our working set named all
  if (projects.length !== workUnit.projects.length && noCloses !== false && closes === undefined) { 
    noCloses = true
  }
  else if (noCloses !== true) {
    closes = closes || workUnit.issues.map((i) => i.id)
    closeTarget = closeTarget || projects[0].name
  }

  // inputs have ben normalized we are now ready to start verifying the repo state
  for (const { name: projectFQN, private: isPrivate } of projects) {
    const [ org, project ] = projectFQN.split('/')
    const projectPath = fsPath.join(app.liq.playground(), org, project)

    let remote
    if (remote = isPrivate === true)
      ([ remote ] = determineOriginAndMain({ projectPath, reporter }));
    else
      remote = WORKSPACE

    verifyClean({ projectPath, reporter })
    verifyBranchInSync({ branch: workKey, description: 'work', projectPath, remote, reporter })
  }
  // everything is verified ready for submission
  const workBranch = workBranchName({ primaryIssueID: issues[0] })

  for (const { name: projectFQN, private: isPrivate } of projects) {
    const [ org, project ] = projectFQN.split('/')

    const octocache = new Octocache({ auth: authToken })

    // build up the PR body
    let body = 'Pull request '

    body += project === closeTarget ? 'to' : 'in support of issues'
    body += issues.length > 1 ? ': \n* ' : ' '
    body += issues
      .map((i) => { 
        const [o,p,n] = i.split('/')
        const issueRef = `${o}/${p}` === project ? `#${n}` : `${o}/${p}#${n}`
        return project === closeTarget
          ? `resolve ${issueRef}`
          : `[${issueRef}](${GH_BASE_URL}/${o}/${p}/issues/${n})`
      })
      .join('\n* ')

    let head
    if (isPrivate === true) {
      const ghUser = determineGitHubLogin({ authToken })
      head = `${ghUser}:${workBranch}`
    }
    else {
      head = workBranch
    }

    const repoData = octocache.request(`GET /repos/${org}/${project}`)
    const base = repoData.default_branch

    await octocache.request(
      'POST /repos/{owner}/{repo}/pulls',
      {
        owner: org,
        repo: project,
        title: workUnit.description,
        body,
        head,
        base
      },
      { noClear: true } // should be OK
    )
  }

  httpSmartResponse({ 
    msg: `Created pull-request for <em>${projects.map((p) => p.name).join('<rst>, <em>')}<rst>.`,
    req, 
    res
  })
}

export { func, help, parameters, paths, method }
