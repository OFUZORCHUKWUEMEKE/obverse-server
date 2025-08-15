import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
// import { CoreRepository } from 'src/core/repository/core.repository';

import { CoreRepository } from 'src/core/common/repository.core';
import { WalletDocument } from './wallet.model';

@Injectable()
export class WalletRepository extends CoreRepository<WalletDocument> {
  constructor(
    @InjectModel('Wallet')
    walletModel: Model<WalletDocument>,
  ) {
    super(walletModel);
  }
}
