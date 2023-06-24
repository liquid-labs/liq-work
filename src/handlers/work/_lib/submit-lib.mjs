import * as fsPath from 'node:path'

import createError from 'http-errors'

import { determineOriginAndMain, verifyBranchInSync, verifyClean } from '@liquid-labs/git-toolkit'
import { determineGitHubLogin } from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'
import { determineCurrentMilestone } from '@liquid-labs/liq-projects-lib'
import { cleanupQAFiles, getGitHubQAFileLinks, runQA, saveQAFiles } from '@liquid-labs/liq-qa-lib'
import { Octocache } from '@liquid-labs/octocache'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { answerSetToMd } from './answer-set-to-md'
import { GH_BASE_URL, WORKSPACE } from './constants'
import { determineProjects } from './determine-projects'
import { prepareQuestionsFromControls } from './prepare-questions-from-controls'
import { WorkDB } from './work-db'

/**
 * Analyzes current state and if branch is clean and up-to-date, creates a PR or updates the existing PR. Will gather * answers for `work-submit-controls` if not included in the request.
 */
const doSubmit = async({ all, app, cache, model, projects, reporter, req, res, workKey }) => {
  reporter = reporter.isolate()

  const { answers, dirtyOK, noPush = false } = req.vars

  const credDB = new CredentialsDB({ app, cache })
  const authToken = credDB.getToken(purposes.GITHUB_API)

  const workDB = new WorkDB({ app, reporter }) // doesn't need auth token

  let workUnit;
  ([projects, workKey, workUnit] =
    await determineProjects({ all, cliEndpoint : 'work submit', projects, reporter, req, workDB, workKey }))
  // map projects to array of project entries ({ name, private })
  projects = projects.map((p) => workUnit.projects.find((wup) => wup.name === p))

  let { assignees, closes, closeTarget, noBrowse = false, noCloses = false } = req.vars

  // determine assignee(s)
  if (assignees === undefined) {
    assignees = [(await determineGitHubLogin({ authToken })).login]
  }

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
  const setRemote = ({ isPrivate, projectPath }) => {
    let remote
    if (isPrivate === true) { ([remote] = determineOriginAndMain({ projectPath, reporter })) }
    else { remote = WORKSPACE }

    return remote
  }

  // first, we check readiness
  for (const { name: projectFQN, private: isPrivate } of projects) {
    reporter.push(`Checking status of <em>${projectFQN}<rst>...`)
    const [org, project] = projectFQN.split('/')
    const projectPath = fsPath.join(app.liq.playground(), org, project)

    const remote = setRemote({ isPrivate, projectPath })

    if (dirtyOK !== true) {
      verifyClean({ projectPath, reporter })
    }
    if (noPush !== true) {
      reporter.push(`Pushing local '${workKey}' changes to remote...`)
      tryExec(`cd '${projectPath}' && git push ${remote} ${workKey}`)
    }
    verifyBranchInSync({ branch : workKey, description : 'work', projectPath, remote, reporter })

    runQA({ projectPath, reporter })
  }
  // we are ready to generate QA files and submit work

  // next, we go through the submitter attestations; we handle this here so that if there's some other reason why the
  // submit would fail, the user doesn't have to go through the questions first
  if (answers === undefined) {
    // we iterate over the projects
    const interogationBundles = await Promise.all(projects.map(async({ name: projectFQN }) => {
      const [orgKey] = projectFQN.split('/')
      const org = model.orgs[orgKey]
      const gitHubOrg = org.requireSetting('github.ORG_NAME')
      console.log('org:', org) // DEBUG
      console.log('org.controls:', org.controlsMap) // DEBUG
      const controlSetMap = org.controlsMap['work-submit-controls']

      if (controlSetMap === undefined) { return {} }
      else {
        const title = `Project ${projectFQN} submission`
        const [, project] = projectFQN.split('/')
        const projectPath = fsPath.join(app.liq.playground(), orgKey, project)

        const qaFileLinkIndex = await getGitHubQAFileLinks({ gitHubOrg, projectPath, reporter })

        const questionBundle = prepareQuestionsFromControls({ title, key : projectFQN, controlSetMap })

        const { env, varsReferenced } = questionBundle

        for (const v of varsReferenced) {
          const value = /* org.projects.get(XXX).getSetting() || */ org.getSetting(`controls.work.submit.${v}`)
          if (value !== undefined) {
            env[v] = value
          }
        }

        for (const qaFile of Object.keys(qaFileLinkIndex)) {
          const { fileType, url } = qaFileLinkIndex[qaFile]
          const urlParam = 'CHANGES_' + fileType.replaceAll(/ /g, '_').toUpperCase() + '_REPORT_URL'
          env[urlParam] = url
        }

        return questionBundle
      }
    }))

    if (interogationBundles.some((ib) => Object.keys(ib).length > 0)) {
      res
        .type('application/json')
        .set('X-Question-and-Answer', 'true')
        .send(interogationBundles)

      return
    }
    // else, there are no questions to ask, let's move on
  } // if (answers === undefined); else:
  const answerData = JSON.parse(answers || '{}')
  for (const { name: projectFQN } of projects) {
    if (!answerData.some((a) => a.key === projectFQN)) {
      throw createError.BadRequest(`Missing attestation results (qna answers) for project '${projectFQN}'.`)
    }
  }

  const prCalls = [] // collects PR create promises so we can kick off multiple in parallel
  const prURLs = []
  for (const { name: projectFQN, private: isPrivate } of projects) {
    const [orgKey, project] = projectFQN.split('/')
    const org = model.orgs[orgKey]
    const gitHubOrg = org.requireSetting('github.ORG_NAME')
    const projectPath = fsPath.join(app.liq.playground(), orgKey, project)

    const qaFiles = await saveQAFiles({ projectPath, reporter })
    const qaFileLinkIndex = await getGitHubQAFileLinks({ gitHubOrg, projectPath, reporter, qaFiles })
    await cleanupQAFiles({ projectPath, reporter })
    // now we need to push the updates to the remote
    const remote = setRemote({ isPrivate, projectPath })
    tryExec(`cd '${projectPath}' && git push ${remote} ${workKey}`)

    const octocache = new Octocache({ authToken })

    let head
    if (isPrivate === true) {
      head = workKey
    }
    else {
      const ghUser = await determineGitHubLogin({ authToken })
      head = `${ghUser.login}:${workKey}`
    }

    const openPRs = await octocache.paginate(`GET /repos/${gitHubOrg}/${project}/pulls`, { head, state : 'open' })
    if (openPRs.length > 0) { // really, should (and I think can) only be one, but this is the better question anyway
      reporter.push(`Project <em>${projectFQN}<rst> branch <code>${workKey}<rst> PR <bold>extant and open<rst>; pushing updates...`)
      let remote
      if (isPrivate === true) { ([remote] = determineOriginAndMain({ projectPath, reporter })) }
      else { remote = WORKSPACE }
      tryExec(`cd '${projectPath}' && git push ${remote} ${workKey}`)

      for (const prData of openPRs) {
        prCalls.push(updatePR({
          answerData,
          authToken,
          closeTarget,
          closes,
          gitHubOrg,
          octocache,
          org,
          prData,
          projectFQN,
          projects,
          reporter,
          qaFileLinkIndex,
          workKey
        }))
      }
    }
    else { // we create the PR
      prCalls.push(createPR({
        answerData,
        app,
        assignees,
        authToken,
        cache,
        closes,
        closeTarget,
        gitHubOrg,
        head,
        octocache,
        org,
        projectFQN,
        projects,
        reporter,
        qaFileLinkIndex,
        workKey,
        workUnit
      }))
    }
  } // projects loop

  prURLs.push(...(await Promise.all(prCalls)))

  if (noBrowse !== true) {
    for (const url of prURLs) {
      tryExec(`open ${url}`, { noThrow : true })
    }
  }

  httpSmartResponse({
    msg : reporter.taskReport.join('\n'),
    req,
    res
  })
}

const getSubmitEndpointParams = ({ descIntro }) => {
  const endpointParams = {
    help : {
      name        : 'Work submit.',
      summary     : 'Submits changes for review and merging.',
      description : `${descIntro} By default, any un-pushed local changes are push to the proper remote. Each PR will reference the associated issues and linked to the primary project's PR for closing when it is merged.

Pushing chanes to the remote can be suppressed with \`noPush\`.

If you have portions that are complete, you can use the \`project\` parameter. Only the specified projects will be included in the submission. In that case, the first project specified will be considered the close target unless \`closeTarget\` is specified, though by default no issues are closed in a partial submit unless \`closes\` is specified.

By default, the system assigns the pull request to the submitter. This may be overriden with the \`assignees\` parameter. Where the system is configured to support it, reviewers are assigned programatically by referencing the reviewer 'qualifications'; alternatively, revewiers may be specified by \`reviewers\` parameter.

When no \`projects\`, no \`closes\` and \`noClose\` are __not__ specified, then the default is to designate the primary project as the \`closeTarget\` and note all issues as being closed when the close target pull request is merged. If the scope of the submission is limited by project or issue, then \`noClose\` is the default. In that situation, you can list specific issues closed via the \`closes\` parameter.

The close target is:
1. the project specified by \`closeTarget\`,
2. the first project listed explicitly by \`projects\`, or
3. the first project in the unit of work list of projects which is still active.`
    },
    method     : 'post',
    parameters : [
      {
        name        : 'answers',
        description : 'A JSON representation of the attestation query results, if any. If not provided, then, where there are controls to be implemented, the process will request the appropriate answers and then bail out, expectin the request to be re-submitted with the answers provided.'
      },
      {
        name         : 'assignees',
        isMultivalue : true,
        description  : 'The pull-request will be assigned to the indicated assignee(s) rather than to the submitter'
        // optionsFunc : pull from qualified staff (attach qualifications to roles)
      },
      {
        name         : 'closes',
        isMultivalue : true,
        description  : `When specified, the effective close target is noted to close the issues. The specified issues must already be associated with the unit of work. Refer to the method description and \`closeTarget\` for information on the effective close target. Issues are specified in the form of &gt;org&lt;/&lt;project&gt;/&lt;issue number&gt;.

  The primary project in the unit of work or, where specified, the first project listed explicitly will be noted to close the specified issues.`
      },
      {
        name        : 'closeTarget',
        description : 'The project which closes the issues associated with the submission. See method description and the`closes` parameter for more on the associated issues.'
      },
      {
        name        : 'dirtyOK',
        isBoolean   : true,
        description : 'When set, will continue even if the local repository is not clean.'
      },
      {
        name        : 'noBrowse',
        isBoolean   : true,
        description : 'Supresses default behavior of opening a browser to the newly created pull request.'
      },
      {
        name        : 'noClosed',
        isBoolean   : true,
        description : 'When set, then no issues are closed in a situation where they would otherwise be closed.'
      },
      {
        name        : 'noPush',
        isBoolean   : true,
        description : 'Supresses the default behavior of pushing local changes to the working remote. If the local and remote branch are not in sync and `noPush` is true, then an error will be thrown.'
      },
      {
        name         : 'projects',
        isMultivalue : true,
        description  : "Limits the project(s) whose changes are submitted to the specified projects. Projects are specified by a standard '&lt;org&gt;/&lt;project&gt;' ID."
        // optionsFunc  : from workDB; add a 'cache or read' function to WorkDB and use it for place like this.
      },
      {
        name         : 'qualifications',
        isMultivalue : true,
        description  : 'Limits the qualifications required to review the changes to the listed qualifications. Qualifications must be a subset of the project qualifications.'
      },
      {
        name         : 'reviewers',
        isMultivalue : true,
        description  : 'Specifies a '
      }
    ]
  }

  Object.freeze(endpointParams.parameters)

  return endpointParams
}

// helper functions
/**
 * Creates a new PR and returns a promise resolving to the PR URL.
 */
const createPR = async({ // TODO: this siganure is redonk; we really want an async so we kick these off in parallel
  // and generate the URL while the specific project data is in scope; so this form an effective parralel closures
  // But we really should cleanup this redonk list...
  answerData,
  app,
  assignees,
  authToken,
  cache,
  closes,
  closeTarget,
  gitHubOrg,
  head,
  octocache,
  org,
  projectFQN,
  projects,
  reporter,
  qaFileLinkIndex,
  workKey,
  workUnit
}) => {
  reporter.push(`Creating PR for <em>${projectFQN}<rst> branch <code>${workKey}<rst>...`)
  // build up the PR body

  const /* project */ answerSet = answerData.find((a) => a.key === projectFQN)
  const bodyPromise = answerSetToMd({
    answerSet,
    authToken,
    closes,
    closeTarget,
    org,
    projectFQN,
    projects,
    qaFileLinkIndex,
    workKey
  })

  const [, project] = projectFQN.split('/')

  const milestonePromise = determineCurrentMilestone({ app, cache, gitHubOrg, project })

  const repoPromise = octocache.request(`GET /repos/${gitHubOrg}/${project}`)

  const [body, milestone, repoData] = await Promise.all([bodyPromise, milestonePromise, repoPromise])

  const base = repoData.default_branch

  const prData = await octocache.request(
    'POST /repos/{owner}/{repo}/pulls',
    {
      owner : gitHubOrg,
      repo  : project,
      title : workUnit.description,
      body,
      head,
      base
    })

  try {
    await octocache.request('PATCH /repos/{owner}/{repo}/issues/{issueNumber}',
      {
        owner       : gitHubOrg,
        repo        : project,
        issueNumber : prData.number,
        assignees,
        milestone
      })

    const collaboratorsData = await octocache.paginate('GET /repos/{owner}/{repo}/collaborators', {
      owner      : gitHubOrg,
      repo       : project,
      permission : 'triage'
    })

    const collaborators = collaboratorsData?.map((cd) => cd.login)

    const possibleReviewers = collaborators.filter((r) => !assignees.includes(r))

    const reviewSource = (possibleReviewers.length > 0 ? possibleReviewers : assignees)
      .filter((r) => r !== prData.user.login) // the PR author cann't review the PR
    if (reviewSource.length > 0) {
      const reviewers = [reviewSource[Math.floor(Math.random() * reviewSource.length)]]

      await octocache.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
        owner       : gitHubOrg,
        repo        : project,
        pull_number : prData.number,
        reviewers
      })
    }
  }
  catch (e) { // we want to continue in the face of errors; as long as the PR was created, we will continue
    reporter.push(`<warn>There were problems completing the PR ${gitHubOrg}/${project}/${prData.number}.<rst> Assignees, milestone, and/or reviewers may not be set.`)
  }

  return `${GH_BASE_URL}/${gitHubOrg}/${project}/pull/${prData.number}`
}

/**
 * Updates the PR body and returns a promise resolving to the PR URL.
 */
const updatePR = async({
  answerData,
  authToken,
  closes,
  closeTarget,
  gitHubOrg,
  octocache,
  org,
  prData,
  projectFQN,
  projects,
  reporter,
  qaFileLinkIndex,
  workKey
}) => {
  reporter.push(`Updating PR <code>${prData.number}<rst> for <em>${projectFQN}<rst> branch <code>${workKey}<rst>...`)
  // build up the PR body

  const answerSet = answerData.find((a) => a.key === projectFQN)
  const body = await answerSetToMd({
    answerSet,
    authToken,
    closes,
    closeTarget,
    org,
    projectFQN,
    projects,
    qaFileLinkIndex,
    workKey
  })

  const [, project] = projectFQN.split('/')

  try {
    await octocache.request('PATCH /repos/{owner}/{repo}/issues/{issueNumber}',
      {
        owner       : gitHubOrg,
        repo        : project,
        issueNumber : prData.number,
        body
      })
  }
  catch (e) { // we want to continue in the face of errors; as long as the PR was created, we will continue
    reporter.push(`<warn>There were problems updating the PR ${gitHubOrg}/${project}/${prData.number}.<rst> Try submitting again or update manually.`)
  }

  return `${GH_BASE_URL}/${gitHubOrg}/${project}/pull/${prData.number}`
}

export { doSubmit, getSubmitEndpointParams }
