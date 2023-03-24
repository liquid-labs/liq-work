import { determineGitHubLogin } from '@liquid-labs/github-toolkit'

import { GH_BASE_URL } from './constants'

const answerSetToMd = async({
  answerSet,
  authToken,
  closes,
  closeTarget,
  projectFQN,
  projects,
  qaFileLinkIndex,
  workKey
}) => {
  const { results } = answerSet

  const githubLogin = (await determineGitHubLogin({ authToken })).login

  console.log('qaFileLinkIndex (answerSetToMd):', qaFileLinkIndex)

  const qaLinksMd = Object.keys(qaFileLinkIndex).reduce((acc, key) => {
    const { fileType, url } = qaFileLinkIndex[key]
    acc.push(`- [${fileType} record](${url})`)
    return acc
  }, []).join('\n')

  let md = 'Pull request '

  md += projectFQN === closeTarget ? 'to' : 'in support of issues'
  md += closes.length > 1 ? ': \n* ' : ' '
  md += closes
    .map((i) => {
      const [o, p, n] = i.split('/')
      const issueRef = `${o}/${p}` === projectFQN ? `#${n}` : `${o}/${p}#${n}`
      return projectFQN === closeTarget
        ? `resolve ${issueRef}`
        : `[${issueRef}](${GH_BASE_URL}/${o}/${p}/issues/${n})`
    })
    .join('\n* ')
  if (projects.length > 1) {
    const otherProjects = projects.filter((p) => p.name !== projectFQN)
    md += '\n\nRelated projects: '
    md += otherProjects.map(({ name: otherProjFQN }) =>
      `[${otherProjFQN}](${GH_BASE_URL}/${otherProjFQN}) `
          + `([PRs](${GH_BASE_URL}/${otherProjFQN}/pulls?q=head%3A${encodeURIComponent(workKey)}))`
    )
      .join(', ')
  }

  md += `\n\nSubmitted by: ${githubLogin}

## Instructions

Review all code changes. Verify the submitter attestations belowe, checking off each statement to indicate that you have reviewed the statement and it is true to the best of your knowledge. If you do not agree with or are unsure of a statement, then add a comment describing your questions or concerns and contact the submitter @${githubLogin} for clarification.

## QA files

${qaLinksMd}

## Submitter attestations

***To be verified by reviewer.***\n\n`
  for (const { disposition, parameter, prompt, rawAnswer, value } of results) {
    if (prompt !== undefined && disposition === 'answered') { // we only need to print out the answered questions
      md += `- [ ] ${prompt.replaceAll(/<(?:em|h1|h2|code|rst)>/g, '')} ${rawAnswer} (_${parameter}=${value}_)\n`
    }
  }

  return md
}

export { answerSetToMd }
