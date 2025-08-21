import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction, TransactionDocument } from './transaction.model';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionService {
  constructor(
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
  ) {}

  async create(
    createTransactionDto: CreateTransactionDto,
  ): Promise<TransactionDocument> {
    const transactionData = {
      ...createTransactionDto,
      walletId: new Types.ObjectId(createTransactionDto.walletId),
      userId: new Types.ObjectId(createTransactionDto.userId),
      paymentLinkId: createTransactionDto.paymentLinkId
        ? new Types.ObjectId(createTransactionDto.paymentLinkId)
        : undefined,
    };

    const transaction = new this.transactionModel(transactionData);
    return transaction.save();
  }

  async findById(id: string): Promise<TransactionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid transaction ID');
    }

    const transaction = await this.transactionModel.findById(id).exec();
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }
}
