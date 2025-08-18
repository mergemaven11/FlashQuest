[**frontend**](../../README.md)

***

# Function: getStudyNext()

> **getStudyNext**(): `Promise`\<`StudyNext`\>

Defined in: [src/api.ts:28](https://github.com/mergemaven11/hiring-tobias-scott-flashcards/blob/c8e996a41de1412e8d2e7fe493533e77247c3e89/frontend/src/api.ts#L28)

Get the next study item or a status if none are due.

## Returns

`Promise`\<`StudyNext`\>

Discriminated union with `status: "ok" | "temporarily_done" | "permanently_done"`.

## Example

```ts
const next = await getStudyNext();
if (next.status === "ok") console.log(next.card.word);
```
