const answerSetToMd = async({
  app,
  answerSet,
  closes,
  closeTarget,
  model,
  noQA,
  org,
  projectFQN,
  projectPath,
  projects,
  reporter,
  workKey
}) => {
  const { results } = answerSet

  const integrationUser = await app.ext.integrations.callHook({
    providerFor  : 'pull request',
    providerArgs : { model, projectFQN },
    hook         : 'getCurrentIntegrationUser',
    hookArgs     : { app }
  })

  let qaLinksMd
  if (noQA !== true) {
    const qaFileLinkIndex = await app.ext.integrations.callHook({
      providerFor  : 'pull request',
      providerArgs : { model, projectFQN },
      hook         : 'getQALinkFileIndex',
      hookArgs     : { org, projectPath, reporter }
    })

    qaLinksMd = Object.keys(qaFileLinkIndex).reduce((acc, key) => {
      const { fileType, url } = qaFileLinkIndex[key]
      acc.push(`- [${fileType} record](${url})`)
      return acc
    }, []).join('\n')
  }

  let md = 'Pull request '

  md += projectFQN === closeTarget ? 'to' : 'in support of issues'
  md += closes.length > 1 ? ': \n* ' : ' '
  md += (await Promise.all(closes.map(async(i) => {
    const [o, p, n] = i.split('/')
    const issueRef = `${o}/${p}` === projectFQN ? `#${n}` : `${o}/${p}#${n}`
    return projectFQN === closeTarget
      ? `resolve ${issueRef}`
      : `[${issueRef}](${await app.ext.integrations.callHook({
        providerFor  : 'tickets',
        providerArgs : { model, projectFQN },
        hook         : 'getIssueURL',
        hookArgs     : { org, project : p, ref : n }
      })})`
  })))
    .reduce((acc, s) => { acc += acc.length === 0 ? s : `\n* ${s}`; return acc }, '')
  if (projects.length > 1) {
    const otherProjects = projects.filter((p) => p.name !== projectFQN)
    md += '\n\nRelated projects: '
    md += (await Promise.all(otherProjects.map(async({ name: otherProjFQN }) => {
      const [, otherProject] = otherProjFQN.split('/')
      const projectURL = await app.ext.integrations.callHook({
        providerFor  : 'tickets',
        providerArgs : { model, org, project : otherProject },
        hook         : 'getProjectURL',
        hookArgs     : { org, project : otherProject }
      })
      const prURL = await app.ext.integrations.callHook({
        providerFor  : 'pull requests',
        providerArgs : { model, projectFQN },
        hook         : 'getPullRequestURLsByHead',
        hookArgs     : { org, project : otherProject, head : workKey }
      })
      return `[${otherProjFQN}](${projectURL}) ([PRs](${prURL}))`
    })))
      .reduce((acc, s) => { acc += acc.length === 0 ? s : `, ${s}`; return acc }, '')
  }

  md += `\n\nSubmitted by: ${integrationUser}

## Instructions

Review all code changes. Verify the submitter attestations belowe, checking off each statement to indicate that you have reviewed the statement and it is true to the best of your knowledge. If you do not agree with or are unsure of a statement, then add a comment describing your questions or concerns and contact the submitter @${integrationUser} for clarification.

## QA files

`
  if (qaLinksMd === undefined) {
    md += '___QA NOT PERFORMED___'
  }
  else {
    md += qaLinksMd
  }

  md += `

## Submitter attestations

***To be verified by reviewer.***\n\n`

  const verifyEach = org.getSetting('controls.work.submit.REVIEW_EACH_ATTESTATION') || false
  for (const { disposition, parameter, prompt, rawAnswer, value } of results) {
    if (prompt !== undefined && disposition === 'answered') { // we only need to print out the answered questions
      md += `- ${verifyEach === true ? '[ ] ' : ''}${prompt.replaceAll(/<(?:em|h1|h2|code|rst)>/g, '')} ${rawAnswer} (_${parameter}=${value}_)\n`
    }
  }

  if (verifyEach === false) {
    md += ' - [ ] I have reviewed and verified the above are true to the best of my knowledge.'
  }

  return md
}

export { answerSetToMd }
