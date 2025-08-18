[**frontend**](../../README.md)

***

# Function: postStudyAnswer()

> **postStudyAnswer**(`cardId`, `result`): `Promise`\<\{ `ok`: `boolean`; `status`: `string`; `to_bin`: `number`; \}\>

Defined in: [src/api.ts:39](https://github.com/mergemaven11/hiring-tobias-scott-flashcards/blob/c8e996a41de1412e8d2e7fe493533e77247c3e89/frontend/src/api.ts#L39)

Submit an answer for a card.

## Parameters

### cardId

`number`

The card's ID.

### result

"correct" or "wrong".

`"correct"` | `"wrong"`

## Returns

`Promise`\<\{ `ok`: `boolean`; `status`: `string`; `to_bin`: `number`; \}\>

Acknowledgement with target bin and resulting status.
