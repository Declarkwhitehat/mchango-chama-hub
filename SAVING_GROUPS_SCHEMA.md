# Saving Groups Feature - Proposed Database Schema

This schema is designed to support the complex logic for group creation, savings, loans, commissions, defaults, and profit distribution as outlined in the feature specification.

## 1. `saving_groups` (Groups)

| Field Name | Data Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | UUID/Serial | Unique Group ID | Primary Key |
| `name` | VARCHAR(255) | Group Name (e.g., “Smart Investors Circle”) | NOT NULL |
| `goal_kes` | NUMERIC(15, 2) | Group Saving Goal in KES (e.g., 500000.00) | NOT NULL |
| `max_members` | INTEGER | Maximum number of members (fixed at 100) | Default: 100, NOT NULL |
| `whatsapp_link` | TEXT | WhatsApp Group Link | NULLABLE |
| `description` | TEXT | Group Description | NULLABLE |
| `profile_picture_url` | TEXT | URL to the group's profile picture | NULLABLE |
| `admin_user_id` | UUID | Foreign Key to the user who created the group | Foreign Key (`users.id`), NOT NULL |
| `created_at` | TIMESTAMP | Group Creation Date | Default: NOW() |
| `total_savings_kes` | NUMERIC(15, 2) | Running total of all member savings | Default: 0.00, NOT NULL |
| `total_profits_kes` | NUMERIC(15, 2) | Running total of all group profits (interest, insurance, defaults) | Default: 0.00, NOT NULL |
| `loan_pool_limit_kes` | NUMERIC(15, 2) | 30% of `total_savings_kes` | Default: 0.00, NOT NULL |
| `is_verified` | BOOLEAN | Status of group verification | Default: FALSE, NOT NULL |
| `cycle_end_date` | DATE | Date for the next profit distribution cycle end | NULLABLE |

## 2. `group_members` (Group Membership)

| Field Name | Data Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | UUID/Serial | Unique Membership ID | Primary Key |
| `group_id` | UUID | Foreign Key to the saving group | Foreign Key (`saving_groups.id`), NOT NULL |
| `user_id` | UUID | Foreign Key to the member's user ID | Foreign Key (`users.id`), NOT NULL |
| `joined_at` | TIMESTAMP | Date and time the member joined | Default: NOW() |
| `personal_savings_kes` | NUMERIC(15, 2) | Running total of the member's savings in this group | Default: 0.00, NOT NULL |
| `is_eligible_for_loan` | BOOLEAN | True if `personal_savings_kes` >= 2000 | Default: FALSE, NOT NULL |
| `has_active_loan` | BOOLEAN | True if the member has an outstanding loan | Default: FALSE, NOT NULL |
| `is_defaulter` | BOOLEAN | True if the member has defaulted on a loan | Default: FALSE, NOT NULL |
| `UNIQUE(group_id, user_id)` | | Ensures a user can only join a group once | |

## 3. `group_transactions` (Savings/Deposits)

| Field Name | Data Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | UUID/Serial | Unique Transaction ID | Primary Key |
| `group_id` | UUID | Foreign Key to the saving group | Foreign Key (`saving_groups.id`), NOT NULL |
| `member_user_id` | UUID | The member whose account is being credited | Foreign Key (`users.id`), NOT NULL |
| `payer_user_id` | UUID | The user who made the payment (can be different from `member_user_id`) | Foreign Key (`users.id`), NOT NULL |
| `amount_kes` | NUMERIC(15, 2) | The gross amount deposited (>= 100) | NOT NULL |
| `commission_kes` | NUMERIC(15, 2) | 1% of `amount_kes` (Company Earnings) | NOT NULL |
| `net_amount_kes` | NUMERIC(15, 2) | `amount_kes` - `commission_kes` (Added to savings) | NOT NULL |
| `type` | VARCHAR(50) | 'DEPOSIT', 'LOAN_REPAYMENT', 'PROFIT_DISTRIBUTION', 'DEFAULT_PAYMENT' | NOT NULL |
| `status` | VARCHAR(50) | 'COMPLETED', 'PENDING', 'FAILED' | NOT NULL |
| `transaction_date` | TIMESTAMP | Date and time of the transaction | Default: NOW() |
| `audit_trail` | JSONB | Detailed audit log of the transaction | NULLABLE |

## 4. `group_loans` (Loans)

| Field Name | Data Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | UUID/Serial | Unique Loan ID | Primary Key |
| `group_id` | UUID | Foreign Key to the saving group | Foreign Key (`saving_groups.id`), NOT NULL |
| `borrower_user_id` | UUID | Foreign Key to the member taking the loan | Foreign Key (`users.id`), NOT NULL |
| `principal_amount_kes` | NUMERIC(15, 2) | The amount borrowed | NOT NULL |
| `interest_rate` | NUMERIC(5, 2) | Interest rate (6.5%) | Default: 6.5, NOT NULL |
| `insurance_fee_rate` | NUMERIC(5, 2) | Insurance fee rate (2%) | Default: 2.0, NOT NULL |
| `total_repayment_kes` | NUMERIC(15, 2) | Principal + Interest | NOT NULL |
| `status` | VARCHAR(50) | 'PENDING_APPROVAL', 'ACTIVE', 'REPAID', 'DEFAULTED' | NOT NULL |
| `requested_at` | TIMESTAMP | Date and time of loan request | Default: NOW() |
| `approved_at` | TIMESTAMP | Date and time of final approval | NULLABLE |
| `due_date` | DATE | Loan repayment due date | NOT NULL |
| `balance_kes` | NUMERIC(15, 2) | Remaining balance to be repaid | NOT NULL |
| `is_guarantor_payment` | BOOLEAN | True if the loan was repaid by guarantors after default | Default: FALSE, NOT NULL |

## 5. `loan_guarantors` (Loan Approvals/Guarantors)

| Field Name | Data Type | Description | Constraints | |
| :--- | :--- | :--- | :--- | :--- |
| `id` | UUID/Serial | Unique Guarantor ID | Primary Key | |
| `loan_id` | UUID | Foreign Key to the loan | Foreign Key (`group_loans.id`), NOT NULL | |
| `guarantor_user_id` | UUID | Foreign Key to the approving member | Foreign Key (`users.id`), NOT NULL | |
| `approved_at` | TIMESTAMP | Date and time of approval | NULLABLE | |
| `is_default_payer` | BOOLEAN | True if this guarantor paid a portion of the defaulted loan | Default: FALSE, NOT NULL | |
| `default_payment_kes` | NUMERIC(15, 2) | Amount paid by guarantor in case of default | Default: 0.00, NOT NULL | |
| `UNIQUE(loan_id, guarantor_user_id)` | | Ensures a user can only guarantee a loan once | | |

## 6. `group_profits` (Profit Distribution Tracking)

| Field Name | Data Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | UUID/Serial | Unique Profit ID | Primary Key |
| `group_id` | UUID | Foreign Key to the saving group | Foreign Key (`saving_groups.id`), NOT NULL |
| `source_type` | VARCHAR(50) | 'LOAN_INTEREST', 'INSURANCE_FEE_GROUP', 'DEFAULT_RECOVERY' | NOT NULL |
| `source_id` | UUID | ID of the loan or transaction that generated the profit | NULLABLE |
| `amount_kes` | NUMERIC(15, 2) | Amount of profit generated | NOT NULL |
| `created_at` | TIMESTAMP | Date and time the profit was generated | Default: NOW() |
| `is_distributed` | BOOLEAN | Whether this profit has been included in a distribution cycle | Default: FALSE, NOT NULL |

## 7. `profit_distribution_log` (Record of Profit Payouts)

| Field Name | Data Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | UUID/Serial | Unique Log ID | Primary Key |
| `group_id` | UUID | Foreign Key to the saving group | Foreign Key (`saving_groups.id`), NOT NULL |
| `member_user_id` | UUID | Foreign Key to the member receiving the profit | Foreign Key (`users.id`), NOT NULL |
| `distribution_cycle_id` | UUID | Unique ID for the distribution event | NOT NULL |
| `total_group_profit_kes` | NUMERIC(15, 2) | Total profit distributed in this cycle | NOT NULL |
| `member_savings_ratio` | NUMERIC(5, 4) | Member's savings / Total group savings (e.g., 0.1000 for 10%) | NOT NULL |
| `member_profit_share_kes` | NUMERIC(15, 2) | The amount of profit the member received | NOT NULL |
| `distributed_at` | TIMESTAMP | Date and time of the distribution | Default: NOW() |

## 8. `company_commissions` (Company Earnings Tracking)

| Field Name | Data Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | UUID/Serial | Unique Commission ID | Primary Key |
| `group_id` | UUID | Foreign Key to the saving group | Foreign Key (`saving_groups.id`), NOT NULL |
| `source_type` | VARCHAR(50) | 'DEPOSIT_COMMISSION', 'INSURANCE_FEE_COMPANY' | NOT NULL |
| `source_id` | UUID | ID of the transaction or loan that generated the commission | NOT NULL |
| `amount_kes` | NUMERIC(15, 2) | Amount of commission earned | NOT NULL |
| `created_at` | TIMESTAMP | Date and time the commission was earned | Default: NOW() |
| `is_paid_out` | BOOLEAN | Whether the commission has been paid out to the company's main account | Default: FALSE, NOT NULL |
