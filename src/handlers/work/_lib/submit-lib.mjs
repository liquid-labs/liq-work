import createError from 'http-errors'

import { determineOriginAndMain, verifyBranchInSync, verifyClean } from '@liquid-labs/git-toolkit'
import { getGitHubOrgAndProjectBasename } from '@liquid-labs/github-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'
import { cleanupQAFiles, runQA, saveQAFiles } from '@liquid-labs/liq-qa-lib'
import { tryExec } from '@liquid-labs/shell-toolkit'

import { answerSetToMd } from './answer-set-to-md'
import { WORKSPACE } from './constants'
import { determineProjects } from './determine-projects'
import { prepareQuestionsFromControls } from './prepare-questions-from-controls'
import { WorkDB } from './work-db'

/**
 * Analyzes current state and if branch is clean and up-to-date, creates a PR or updates the existing PR. Will gather * answers for `work-submit-controls` if not included in the request.
 */
const doSubmit = async({ all, app, cache, projects, reporter, req, res, workKey }) => {
  reporter = reporter.isolate()
  const { answers, dirtyOK, noPush = false, noQA = false } = req.vars

  const workDB = new WorkDB({ app, reporter }) // doesn't need auth token

  let workUnit;
  ([projects, workKey, workUnit] =
    await determineProjects({ all, cliEndpoint : 'work submit', projects, reporter, req, workDB, workKey }))
  // map projects to array of project entries ({ name, private })
  projects = projects.map((p) => workUnit.projects.find((wup) => wup.name === p))

  let { assignees, closes, closeTarget, noBrowse = false, noCloses = false } = req.vars
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
    const { projectPath } = app.ext._liqProjects.playgroundMonitor.getProjectData(projectFQN)

    const remote = setRemote({ isPrivate, projectPath })

    if (dirtyOK !== true) {
      verifyClean({ projectPath, reporter })
    }
    if (noPush !== true) {
      reporter.push(`Pushing local '${workKey}' changes to remote...`)
      tryExec(`cd '${projectPath}' && git push ${remote} ${workKey}`)
    }
    verifyBranchInSync({ branch : workKey, description : 'work', projectPath, remote, reporter })
    if (noQA !== true) {
      runQA({ projectPath, reporter })
    }
  }

  // we are ready to generate QA files and submit work

  // next, we go through the submitter attestations; we handle this here so that if there's some other reason why the
  // submit would fail, the user doesn't have to go through the questions first
  if (answers === undefined) {
    // we iterate over the projects
    const interogationBundles = await Promise.all(projects.map(async({ name: projectFQN }) => {
      const { pkgJSON, projectPath } = app.ext._liqProjects.playgroundMonitor.getProjectData(projectFQN)
      const { name: projectName } = pkgJSON

      const supportsControls = app.ext.integrations.hasHook({
        providerFor : 'controls',
        hook        : 'getQuestionControls'
      })

      if (supportsControls === false) {
        return {}
      }

      const controlsSpec = app.ext.integrations.callHook({
        providerFor : 'controls',
        hook        : 'getQuestionControls',
        hookArgs    : { app, controlsName : 'work-submit', projectName, reporter }
      })

      if (controlsSpec === undefined) {
        return {}
      }
      else {
        const title = `Project ${projectFQN} submission`

        const questionBundle = prepareQuestionsFromControls({ title, key : projectFQN, controlsSpec })
        const { env /* varsReferenced */ } = questionBundle

        /* This was a feature without a use case, I think. But I can see it being useful.
        for (const v of varsReferenced) {
          const value = org.getSetting(`controls.work.submit.${v}`)
          if (value !== undefined) {
            env[v] = value
          }
        } */

        if (noQA === true) {
          // 'NONE' is a reserved word that evaluations to 0
          env.CHANGES_UNIT_TEST_REPORT_URL = 'TEST SKIPPED'
          env.CHANGES_LINT_REPORT_URL = 'LINT SKIPPED'
        }
        else {
          const qaFileLinkIndex = await app.ext.integrations.callHook({
            providerFor  : 'pull request',
            providerArgs : { pkgJSON },
            hook         : 'getQALinkFileIndex',
            hookArgs     : { app, pkgJSON, projectPath, reporter }
          })

          for (const qaFile of Object.keys(qaFileLinkIndex)) {
            const { fileType, url } = qaFileLinkIndex[qaFile]
            const urlParam = 'CHANGES_' + fileType.replaceAll(/ /g, '_').toUpperCase() + '_REPORT_URL'
            env[urlParam] = url
          }
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

  const prURLs = []
  for (const { name: projectFQN, private: isPrivate } of projects) {
    const { pkgJSON, projectPath } = app.ext._liqProjects.playgroundMonitor.getProjectData(projectFQN)
    const { org: gitHubOrg, projectBasename } = getGitHubOrgAndProjectBasename({ packageJSON : pkgJSON })

    const qaFiles = await saveQAFiles({ projectPath, reporter })

    const /* project */ answerSet = answerData.find((a) => a.key === projectFQN)
    const prBody = await answerSetToMd({
      answerSet,
      app,
      closes,
      closeTarget,
      gitHubOrg,
      noQA,
      pkgJSON,
      projectFQN,
      projectPath,
      projects,
      reporter,
      workKey
    })

    if (noQA !== true) {
      await cleanupQAFiles({ projectPath, reporter })
    }
    // now we need to push the updates to the remote
    const remote = setRemote({ isPrivate, projectPath })
    tryExec(`cd '${projectPath}' && git push ${remote} ${workKey}`)

    prURLs.push(...await app.ext.integrations.callHook({
      providerFor  : 'pull request',
      providerArgs : { pkgJSON },
      hook         : 'createOrUpdatePullRequest',
      hookArgs     : {
        app,
        assignees,
        cache,
        closes,
        closeTarget,
        isPrivate,
        projectBasename,
        qaFiles,
        prBody,
        projectFQN,
        projectPath,
        reporter,
        workKey,
        workUnit
      }
    }))
  } // projects loop

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
        name        : 'noQA',
        isBoolean   : true,
        description : 'supresses the default QA tests.'
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

export { doSubmit, getSubmitEndpointParams }
