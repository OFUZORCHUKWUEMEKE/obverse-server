import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
// import { CoreRepository } from 'src/core/repository/core.repository';

import { CoreRepository } from 'src/core/common/repository.core';
import { TransactionDocument } from './transaction.model';

@Injectable()
export class TransactionRepository extends CoreRepository<TransactionDocument> {
  constructor(
    @InjectModel('Transaction')
    transactionModel: Model<TransactionDocument>,
  ) {
    super(transactionModel);
  }
}
