# Data model

`budgets` holds named budgets. `budget_members` joins budgets to `auth.users`
with primary key `(budget_id, user_id)`. Users can belong to many budgets;
budgets can have many users.

Every envelope has a required `budget_id` foreign key. Envelope names are unique
within a budget, ignoring case. Members can read and create its envelopes.
Deleting a budget cascades to its envelopes and memberships. Deleting a user
removes memberships without deleting shared budgets.

The migration gives each existing user a Personal budget and moves their existing
envelopes into it, preserving envelope IDs and timestamps. New users receive a
Personal budget at signup.

`create_budget(name)` creates a budget and its first membership atomically.
Membership changes require trusted database operations; clients cannot enroll
themselves in other budgets.

Envelope creation accepts optional `budget_id`. If omitted, the user's sole
budget is used. Users with multiple budgets must supply an explicit ID. Listing
currently includes envelopes from all budgets the caller belongs to. Budget
selection and membership management UI are outside this data model change.
